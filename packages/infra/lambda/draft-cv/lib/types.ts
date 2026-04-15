import {
  BedrockRuntimeClient,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

export interface DraftCVInput {
  jobId: string;
  s3ResumeKey: string;
  s3JobDescKey: string;
  s3CompanyInfoKey?: string;
}

export interface DraftCVOutput {
  jobId: string;
  /** "FIT" when the candidate passes pre-screening; "NO_FIT" when the screen rejects them. */
  fitVerdict: "FIT" | "NO_FIT";
  /** Human-readable reason populated only on NO_FIT. */
  fitReason?: string;
  /** Absent when fitVerdict is "NO_FIT". */
  s3TailoredCVKey?: string;
  /** Absent when fitVerdict is "NO_FIT". */
  s3CoverLetterKey?: string;
  s3JobDescKey: string;
  s3CompanyInfoKey?: string;
}

export interface DraftCVClients {
  s3: S3Client;
  dynamo: DynamoDBClient;
  bedrock: BedrockRuntimeClient;
}

export interface DraftCVEnv {
  bedrockModelId: string;
  /** Model ID for the cheap pre-screening call. Defaults to bedrockModelId if not set via env. */
  bedrockScreenModelId: string;
  jobsTableName: string;
  resultsBucketName: string;
}
