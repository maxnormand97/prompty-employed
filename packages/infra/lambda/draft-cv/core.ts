import { log } from "./lib/log";
import { readS3Object, writeS3Object } from "./lib/s3";
import { setJobStatus, setJobComplete } from "./lib/dynamo";
import { invokeBedrockText } from "./lib/bedrock";
import { DRAFT_SYSTEM_PROMPT, buildDraftPrompt, buildScreenPrompt } from "./lib/prompt";
import { DraftCVInput, DraftCVOutput, DraftCVClients, DraftCVEnv } from "./lib/types";

const DELIMITER = "---COVER_LETTER_START---";

export async function runDraftCV(
  event: DraftCVInput,
  clients: DraftCVClients,
  env: DraftCVEnv
): Promise<DraftCVOutput> {
  const { jobId, s3ResumeKey, s3JobDescKey, s3CompanyInfoKey } = event;
  const { s3, dynamo, bedrock } = clients;
  const { bedrockModelId, bedrockScreenModelId, jobsTableName, resultsBucketName } = env;

  log("info", "runDraftCV started", {
    jobId,
    s3ResumeKey,
    s3JobDescKey,
    s3CompanyInfoKey,
    bedrockModelId,
    bedrockScreenModelId,
    jobsTableName,
    resultsBucketName,
  });

  // 1. Update status to DRAFTING
  await setJobStatus(dynamo, jobsTableName, jobId, "DRAFTING");

  try {
    // 2. Fetch resume and job description text from S3
    log("info", "Fetching S3 artefacts", { jobId });
    const [resume, jobDescription, companyInfo] = await Promise.all([
      readS3Object(s3, resultsBucketName, s3ResumeKey),
      readS3Object(s3, resultsBucketName, s3JobDescKey),
      s3CompanyInfoKey
        ? readS3Object(s3, resultsBucketName, s3CompanyInfoKey)
        : Promise.resolve(undefined),
    ]);
    log("info", "S3 artefacts fetched", {
      jobId,
      resumeLength: resume.length,
      jobDescLength: jobDescription.length,
      companyInfoLength: companyInfo?.length ?? 0,
    });

    // 3. Pre-screening: cheap Haiku call to check minimum fit before the expensive draft
    const screenPrompt = buildScreenPrompt(resume, jobDescription);
    const rawScreenResponse = await invokeBedrockText(
      bedrock,
      bedrockScreenModelId,
      screenPrompt,
      { maxTokens: 256 }
    );

    // Audit: persist screen artefacts for observability and future model training
    await Promise.all([
      writeS3Object(s3, resultsBucketName, `results/${jobId}/audit/screen-prompt.txt`, screenPrompt),
      writeS3Object(s3, resultsBucketName, `results/${jobId}/audit/screen-raw-response.txt`, rawScreenResponse),
    ]);

    // Parse the screen verdict — fail-open: if parsing fails, treat as FIT
    let fitVerdict: "FIT" | "NO_FIT" = "FIT";
    let fitReason: string | undefined;
    try {
      const screen = JSON.parse(rawScreenResponse) as { verdict?: string; reason?: string };
      if (screen.verdict === "NO") {
        fitVerdict = "NO_FIT";
        fitReason =
          (screen.reason ?? "").trim() ||
          "Candidate does not meet minimum requirements for this role.";
      }
    } catch {
      log("warn", "Screen response was not valid JSON — treating as FIT", {
        jobId,
        rawScreenResponse,
      });
    }

    if (fitVerdict === "NO_FIT") {
      log("info", "Pre-screen returned NO_FIT — skipping draft and critique", {
        jobId,
        fitReason,
      });
      const completedAt = new Date().toISOString();
      const s3AnalysisKey = `results/${jobId}/analysis.json`;
      const noFitAnalysis = {
        jobId,
        completedAt,
        fitVerdict: "NO_FIT",
        fitReason,
        critiqueNotes: `Automated pre-screening determined the candidate does not have a sufficient basis to apply for this role. Reason: ${fitReason}`,
        fitScore: 5,
        fitRationale:
          "The candidate lacks the minimum qualifications or experience required for this role based on automated pre-screening.",
        likelihoodScore: 5,
        likelihoodRationale:
          "The candidate would not be expected to pass initial screening for this role.",
        suggestedImprovements: [],
        gapAnalysis: [],
        companySummary: "",
      };

      await writeS3Object(
        s3,
        resultsBucketName,
        s3AnalysisKey,
        JSON.stringify(noFitAnalysis, null, 2)
      );
      await setJobComplete(dynamo, jobsTableName, jobId, s3AnalysisKey, completedAt);

      log("info", "runDraftCV complete (NO_FIT path)", { jobId, fitReason });
      return { jobId, fitVerdict: "NO_FIT", fitReason, s3JobDescKey, s3CompanyInfoKey };
    }

    // 4. Build prompt and call Bedrock for the full draft
    const draftPrompt = buildDraftPrompt(resume, jobDescription, companyInfo);
    const rawDraftResponse = await invokeBedrockText(bedrock, bedrockModelId, draftPrompt, {
      systemPrompt: DRAFT_SYSTEM_PROMPT,
    });

    // Audit: persist draft artefacts for observability and future model training
    await Promise.all([
      writeS3Object(s3, resultsBucketName, `results/${jobId}/audit/draft-prompt.txt`, draftPrompt),
      writeS3Object(
        s3,
        resultsBucketName,
        `results/${jobId}/audit/draft-raw-response.txt`,
        rawDraftResponse
      ),
    ]);

    // 5. Split response on delimiter
    const delimiterIndex = rawDraftResponse.indexOf(DELIMITER);
    if (delimiterIndex === -1) {
      throw new Error("Bedrock response missing cover letter delimiter");
    }

    const tailoredCV = rawDraftResponse.slice(0, delimiterIndex).trim();
    const coverLetter = rawDraftResponse.slice(delimiterIndex + DELIMITER.length).trim();

    if (!tailoredCV || !coverLetter) {
      throw new Error("Bedrock response produced empty CV or cover letter");
    }

    log("info", "Response parsed", {
      jobId,
      tailoredCVLength: tailoredCV.length,
      coverLetterLength: coverLetter.length,
    });

    // 6. Write CV artefacts to S3
    const s3TailoredCVKey = `results/${jobId}/tailored-cv.md`;
    const s3CoverLetterKey = `results/${jobId}/cover-letter.md`;

    log("info", "Writing artefacts to S3", { jobId, s3TailoredCVKey, s3CoverLetterKey });
    await Promise.all([
      writeS3Object(s3, resultsBucketName, s3TailoredCVKey, tailoredCV),
      writeS3Object(s3, resultsBucketName, s3CoverLetterKey, coverLetter),
    ]);

    log("info", "runDraftCV complete", { jobId, s3TailoredCVKey, s3CoverLetterKey });

    // 7. Return S3 keys for the next Step Function state
    return { jobId, fitVerdict: "FIT", s3TailoredCVKey, s3CoverLetterKey, s3JobDescKey, s3CompanyInfoKey };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log("error", "runDraftCV failed", { jobId, error: errorMessage, stack });
    await setJobStatus(dynamo, jobsTableName, jobId, "FAILED", errorMessage);
    throw err;
  }
}
