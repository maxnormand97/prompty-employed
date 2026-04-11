import { log } from "./lib/log";
import { readS3Object, writeS3Object } from "./lib/s3";
import { setJobCritiquing, setJobComplete, setJobFailed } from "./lib/dynamo";
import { invokeBedrockText } from "./lib/bedrock";
import { buildCritiquePrompt } from "./lib/prompt";
import { parseCritiqueResponse } from "./lib/response";
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
  const { jobId, s3TailoredCVKey, s3CoverLetterKey, s3JobDescKey } = event;
  const { s3, dynamo, bedrock } = clients;
  const { bedrockModelId, jobsTableName, resultsBucketName } = env;

  log("info", "runCritiqueCV started", {
    jobId,
    s3TailoredCVKey,
    s3CoverLetterKey,
    s3JobDescKey,
    bedrockModelId,
    jobsTableName,
    resultsBucketName,
  });

  // 1. Update status to CRITIQUE
  await setJobCritiquing(dynamo, jobsTableName, jobId);

  try {
    // 2. Fetch all artefacts from S3
    log("info", "Fetching S3 artefacts", { jobId });
    const [tailoredCV, coverLetter, jobDescription] = await Promise.all([
      readS3Object(s3, resultsBucketName, s3TailoredCVKey),
      readS3Object(s3, resultsBucketName, s3CoverLetterKey),
      readS3Object(s3, resultsBucketName, s3JobDescKey),
    ]);
    log("info", "S3 artefacts fetched", {
      jobId,
      tailoredCVLength: tailoredCV.length,
      coverLetterLength: coverLetter.length,
      jobDescLength: jobDescription.length,
    });

    // 3. Build prompt and call Bedrock
    const prompt = buildCritiquePrompt(tailoredCV, coverLetter, jobDescription);
    const rawResponse = await invokeBedrockText(bedrock, bedrockModelId, prompt);

    // 4. Parse and validate the response
    const result = parseCritiqueResponse(rawResponse);
    log("info", "Critique parsed", {
      jobId,
      fitScore: result.fitScore,
      likelihoodScore: result.likelihoodScore,
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

    // 6. Write s3Key reference to DynamoDB and set status to COMPLETE
    await setJobComplete(dynamo, jobsTableName, jobId, s3AnalysisKey, completedAt);

    log("info", "runCritiqueCV complete", {
      jobId,
      fitScore: result.fitScore,
      likelihoodScore: result.likelihoodScore,
    });

    return {
      jobId,
      critiqueNotes: result.critiqueNotes,
      fitScore: result.fitScore,
      fitRationale: result.fitRationale,
      likelihoodScore: result.likelihoodScore,
      likelihoodRationale: result.likelihoodRationale,
      suggestedImprovements: result.suggestedImprovements,
      gapAnalysis: result.gapAnalysis,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log("error", "runCritiqueCV failed", { jobId, error: errorMessage, stack });
    await setJobFailed(dynamo, jobsTableName, jobId, errorMessage);
    throw err;
  }
}
