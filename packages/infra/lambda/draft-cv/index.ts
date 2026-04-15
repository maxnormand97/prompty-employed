/**
 * DraftCVLambda — Lambda entrypoint
 *
 * Node 1 of the TailorCVWorkflow Step Function.
 *
 * Environment variables (set by CDK):
 *   BEDROCK_MODEL_ID      — e.g. "anthropic.claude-3-7-sonnet-20250219-v1:0"
 *   JOBS_TABLE_NAME       — DynamoDB table name ("PromptlyEmployedJobs")
 *   RESULTS_BUCKET_NAME   — S3 bucket name ("PromptlyEmployedResults")
 *
 * IAM requirements:
 *   - dynamodb:UpdateItem on the jobs table
 *   - bedrock:InvokeModel on the Bedrock model ARN
 *   - s3:GetObject on inputs/{jobId}/*
 *   - s3:PutObject on results/{jobId}/*
 */

import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

import { log } from "./lib/log";
import { loadEnv } from "./lib/env";
import { DraftCVInput, DraftCVOutput, DraftCVClients } from "./lib/types";
import { runDraftCV } from "./core";

export { log } from "./lib/log";
export { loadEnv } from "./lib/env";
export { readS3Object, writeS3Object } from "./lib/s3";
export { setJobStatus, setJobComplete } from "./lib/dynamo";
export { invokeBedrockText } from "./lib/bedrock";
export { DRAFT_SYSTEM_PROMPT, buildDraftPrompt, buildScreenPrompt } from "./lib/prompt";
export { runDraftCV } from "./core";
export type {
  DraftCVInput,
  DraftCVOutput,
  DraftCVClients,
  DraftCVEnv,
} from "./lib/types";

// ── Lambda handler ─────────────────────────────────────────────────────────

export async function handler(event: DraftCVInput): Promise<DraftCVOutput> {
  log("info", "DraftCVLambda handler invoked", { event });
  try {
    const env = loadEnv();
    log("info", "Environment loaded", {
      bedrockModelId: env.bedrockModelId,
      jobsTableName: env.jobsTableName,
      resultsBucketName: env.resultsBucketName,
    });
    const clients: DraftCVClients = {
      s3: new S3Client({}),
      dynamo: new DynamoDBClient({}),
      bedrock: new BedrockRuntimeClient({}),
    };
    return await runDraftCV(event, clients, env);
  } catch (err) {
    log("error", "DraftCVLambda handler error", {
      jobId: event.jobId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}
