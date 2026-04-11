import { DraftCVEnv } from "./types";

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnv(): DraftCVEnv {
  return {
    bedrockModelId: getRequiredEnvVar("BEDROCK_MODEL_ID"),
    jobsTableName: getRequiredEnvVar("JOBS_TABLE_NAME"),
    resultsBucketName: getRequiredEnvVar("RESULTS_BUCKET_NAME"),
  };
}
