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
  s3TailoredCVKey: string;
  s3CoverLetterKey: string;
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
  jobsTableName: string;
  resultsBucketName: string;
}
