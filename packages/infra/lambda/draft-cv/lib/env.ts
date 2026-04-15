import { DraftCVEnv } from "./types";

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnv(): DraftCVEnv {
  const bedrockModelId = getRequiredEnvVar("BEDROCK_MODEL_ID");
  return {
    bedrockModelId,
    bedrockScreenModelId: process.env["BEDROCK_SCREEN_MODEL_ID"]?.trim() || bedrockModelId,
    jobsTableName: getRequiredEnvVar("JOBS_TABLE_NAME"),
    resultsBucketName: getRequiredEnvVar("RESULTS_BUCKET_NAME"),
  };
}
