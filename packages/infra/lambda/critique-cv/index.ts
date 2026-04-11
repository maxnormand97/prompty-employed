/**
 * CritiqueCVLambda — Lambda entrypoint
 *
 * Node 2 of the TailorCVWorkflow Step Function.
 *
 * Environment variables (set by CDK):
 *   BEDROCK_MODEL_ID      — e.g. "anthropic.claude-3-haiku-20240307-v1:0"
 *   JOBS_TABLE_NAME       — DynamoDB table name ("PromptlyEmployedJobs")
 *   RESULTS_BUCKET_NAME   — S3 bucket name ("PromptlyEmployedResults")
 *
 * IAM requirements:
 *   - dynamodb:UpdateItem on the jobs table
 *   - bedrock:InvokeModel on the Bedrock model ARN
 *   - s3:GetObject on results/{jobId}/*
 *   - s3:PutObject on results/{jobId}/*
 */

import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

import { log } from "./lib/log";
import { loadEnv } from "./lib/env";
import { CritiqueCVInput, CritiqueCVOutput, CritiqueCVClients } from "./lib/types";
import { runCritiqueCV } from "./core";

// ── Re-exports (consumed by tests and other modules) ───────────────────────
export { log } from "./lib/log";
export { loadEnv } from "./lib/env";
export { readS3Object, writeS3Object } from "./lib/s3";
export { setJobCritiquing, setJobComplete, setJobFailed } from "./lib/dynamo";
export { invokeBedrockText } from "./lib/bedrock";
export { buildCritiquePrompt } from "./lib/prompt";
export { parseCritiqueResponse } from "./lib/response";
export { runCritiqueCV } from "./core";
export type {
  CritiqueCVInput,
  CritiqueCVOutput,
  CritiqueCVClients,
  CritiqueCVEnv,
  GapAdvice,
  CritiqueResult,
} from "./lib/types";

// ── Lambda handler ─────────────────────────────────────────────────────────

export async function handler(event: CritiqueCVInput): Promise<CritiqueCVOutput> {
  log("info", "CritiqueCVLambda handler invoked", { event });
  try {
    const env = loadEnv();
    log("info", "Environment loaded", {
      bedrockModelId: env.bedrockModelId,
      jobsTableName: env.jobsTableName,
      resultsBucketName: env.resultsBucketName,
    });
    const clients: CritiqueCVClients = {
      s3: new S3Client({}),
      dynamo: new DynamoDBClient({}),
      bedrock: new BedrockRuntimeClient({}),
    };
    return await runCritiqueCV(event, clients, env);
  } catch (err) {
    log("error", "CritiqueCVLambda handler error", {
      jobId: event.jobId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}
