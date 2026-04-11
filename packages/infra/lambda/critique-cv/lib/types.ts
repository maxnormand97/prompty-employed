import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

export interface CritiqueCVInput {
  jobId: string;
  s3TailoredCVKey: string;
  s3CoverLetterKey: string;
  s3JobDescKey: string;
}

export interface CritiqueCVOutput {
  jobId: string;
  critiqueNotes: string;
  fitScore: number;
  fitRationale: string;
  likelihoodScore: number;
  likelihoodRationale: string;
  suggestedImprovements: string[];
  gapAnalysis: GapAdvice[];
}

export interface GapAdvice {
  gap: string;
  advice: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface CritiqueResult {
  critiqueNotes: string;
  fitScore: number;
  fitRationale: string;
  likelihoodScore: number;
  likelihoodRationale: string;
  suggestedImprovements: string[];
  gapAnalysis: GapAdvice[];
}

export interface CritiqueCVClients {
  s3: S3Client;
  dynamo: DynamoDBClient;
  bedrock: BedrockRuntimeClient;
}

export interface CritiqueCVEnv {
  bedrockModelId: string;
  jobsTableName: string;
  resultsBucketName: string;
}
