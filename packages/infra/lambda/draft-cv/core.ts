import { log } from "./lib/log";
import { readS3Object, writeS3Object } from "./lib/s3";
import { setJobStatus } from "./lib/dynamo";
import { invokeBedrockText } from "./lib/bedrock";
import { buildDraftPrompt } from "./lib/prompt";
import { DraftCVInput, DraftCVOutput, DraftCVClients, DraftCVEnv } from "./lib/types";

const DELIMITER = "---COVER_LETTER_START---";

export async function runDraftCV(
  event: DraftCVInput,
  clients: DraftCVClients,
  env: DraftCVEnv
): Promise<DraftCVOutput> {
  const { jobId, s3ResumeKey, s3JobDescKey } = event;
  const { s3, dynamo, bedrock } = clients;
  const { bedrockModelId, jobsTableName, resultsBucketName } = env;

  log("info", "runDraftCV started", {
    jobId,
    s3ResumeKey,
    s3JobDescKey,
    bedrockModelId,
    jobsTableName,
    resultsBucketName,
  });

  // 1. Update status to DRAFTING
  await setJobStatus(dynamo, jobsTableName, jobId, "DRAFTING");

  try {
    // 2. Fetch resume and job description text from S3
    log("info", "Fetching S3 artefacts", { jobId });
    const [resume, jobDescription] = await Promise.all([
      readS3Object(s3, resultsBucketName, s3ResumeKey),
      readS3Object(s3, resultsBucketName, s3JobDescKey),
    ]);
    log("info", "S3 artefacts fetched", {
      jobId,
      resumeLength: resume.length,
      jobDescLength: jobDescription.length,
    });

    // 3. Build prompt and call Bedrock
    const prompt = buildDraftPrompt(resume, jobDescription);
    const rawResponse = await invokeBedrockText(bedrock, bedrockModelId, prompt);

    // 4. Split response on delimiter
    const delimiterIndex = rawResponse.indexOf(DELIMITER);
    if (delimiterIndex === -1) {
      throw new Error("Bedrock response missing cover letter delimiter");
    }

    const tailoredCV = rawResponse.slice(0, delimiterIndex).trim();
    const coverLetter = rawResponse.slice(delimiterIndex + DELIMITER.length).trim();

    if (!tailoredCV || !coverLetter) {
      throw new Error("Bedrock response produced empty CV or cover letter");
    }

    log("info", "Response parsed", {
      jobId,
      tailoredCVLength: tailoredCV.length,
      coverLetterLength: coverLetter.length,
    });

    // 5. Write artefacts to S3
    const s3TailoredCVKey = `results/${jobId}/tailored-cv.md`;
    const s3CoverLetterKey = `results/${jobId}/cover-letter.md`;

    log("info", "Writing artefacts to S3", { jobId, s3TailoredCVKey, s3CoverLetterKey });
    await Promise.all([
      writeS3Object(s3, resultsBucketName, s3TailoredCVKey, tailoredCV),
      writeS3Object(s3, resultsBucketName, s3CoverLetterKey, coverLetter),
    ]);

    log("info", "runDraftCV complete", { jobId, s3TailoredCVKey, s3CoverLetterKey });

    // 6. Return S3 keys for the next Step Function state
    return { jobId, s3TailoredCVKey, s3CoverLetterKey, s3JobDescKey };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log("error", "runDraftCV failed", { jobId, error: errorMessage, stack });
    await setJobStatus(dynamo, jobsTableName, jobId, "FAILED", errorMessage);
    throw err;
  }
}
