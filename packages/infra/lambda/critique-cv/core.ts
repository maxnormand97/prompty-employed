import { log } from "./lib/log";
import { readS3Object, writeS3Object } from "./lib/s3";
import { setJobCritiquing, setJobComplete, setJobFailed } from "./lib/dynamo";
import { invokeBedrockText } from "./lib/bedrock";
import { buildCritiquePrompt } from "./lib/prompt";
import { parseCritiqueResponse } from "./lib/response";
import { normalizeJobDescription } from "./lib/normalization";
import { enforceCritiquePolicy } from "./lib/policy";
import {
  CritiqueCVInput,
  CritiqueCVOutput,
  CritiqueCVClients,
  CritiqueCVEnv,
} from "./lib/types";

export async function runCritiqueCV(
  event: CritiqueCVInput,
  clients: CritiqueCVClients,
  env: CritiqueCVEnv
): Promise<CritiqueCVOutput> {
  const { jobId, s3TailoredCVKey, s3CoverLetterKey, s3JobDescKey, s3CompanyInfoKey } = event;
  const { s3, dynamo, bedrock } = clients;
  const { bedrockModelId, jobsTableName, resultsBucketName } = env;

  log("info", "runCritiqueCV started", {
    jobId,
    s3TailoredCVKey,
    s3CoverLetterKey,
    s3JobDescKey,
    s3CompanyInfoKey,
    bedrockModelId,
    jobsTableName,
    resultsBucketName,
  });

  // 1. Update status to CRITIQUE
  await setJobCritiquing(dynamo, jobsTableName, jobId);

  try {
    // 2. Fetch all artefacts from S3
    log("info", "Fetching S3 artefacts", { jobId });
    const [tailoredCV, coverLetter, jobDescription, companyInfo] = await Promise.all([
      readS3Object(s3, resultsBucketName, s3TailoredCVKey),
      readS3Object(s3, resultsBucketName, s3CoverLetterKey),
      readS3Object(s3, resultsBucketName, s3JobDescKey),
      s3CompanyInfoKey
        ? readS3Object(s3, resultsBucketName, s3CompanyInfoKey)
        : Promise.resolve(undefined),
    ]);
    log("info", "S3 artefacts fetched", {
      jobId,
      tailoredCVLength: tailoredCV.length,
      coverLetterLength: coverLetter.length,
      jobDescLength: jobDescription.length,
      companyInfoLength: companyInfo?.length ?? 0,
    });

    // 3. Normalize JD, build prompt and call Bedrock
    const normalization = normalizeJobDescription(jobDescription);
    const prompt = buildCritiquePrompt(tailoredCV, coverLetter, jobDescription, companyInfo);
    const rawResponse = await invokeBedrockText(bedrock, bedrockModelId, prompt);

    // 4. Parse, validate and deterministically enforce policy constraints
    const parsedResult = parseCritiqueResponse(rawResponse);
    const { result } = enforceCritiquePolicy({
      modelResult: parsedResult,
      normalization,
      tailoredCV,
      coverLetter,
      jobDescription,
    });
    log("info", "Critique parsed", {
      jobId,
      fitScore: result.fitScore,
      likelihoodScore: result.likelihoodScore,
      hardFloorTriggers: result.hardFloorTriggers,
    });

    // 5. Write analysis JSON to S3
    const completedAt = new Date().toISOString();
    const s3AnalysisKey = `results/${jobId}/analysis.json`;
    await writeS3Object(
      s3,
      resultsBucketName,
      s3AnalysisKey,
      JSON.stringify({ ...result, jobId, completedAt }, null, 2)
    );

    // 6. Write s3Key, fitVerdict and fitScore to DynamoDB and set status to COMPLETE.
    // fitVerdict and fitScore are stored as top-level attributes so the jobs table
    // can be queried/scanned by verdict without fetching the full S3 result.
    await setJobComplete(dynamo, jobsTableName, jobId, s3AnalysisKey, completedAt, result.fitVerdict, result.fitScore);

    log("info", "runCritiqueCV complete", {
      jobId,
      fitScore: result.fitScore,
      likelihoodScore: result.likelihoodScore,
    });

    return {
      jobId,
      critiqueNotes: result.critiqueNotes,
      fitScore: result.fitScore,
      fitVerdict: result.fitVerdict,
      fitRationale: result.fitRationale,
      likelihoodScore: result.likelihoodScore,
      likelihoodRationale: result.likelihoodRationale,
      suggestedImprovements: result.suggestedImprovements,
      gapAnalysis: result.gapAnalysis,
      companySummary: result.companySummary,
      redFlags: result.redFlags,
      hardFloorTriggers: result.hardFloorTriggers,
      requirementsCoverage: result.requirementsCoverage,
      confidenceScore: result.confidenceScore,
      normalizationSummary: result.normalizationSummary,
      policyAdjustments: result.policyAdjustments,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log("error", "runCritiqueCV failed", { jobId, error: errorMessage, stack });
    await setJobFailed(dynamo, jobsTableName, jobId, errorMessage);
    throw err;
  }
}
