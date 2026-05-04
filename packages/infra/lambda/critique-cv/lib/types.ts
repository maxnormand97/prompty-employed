import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

export interface CritiqueCVInput {
  jobId: string;
  s3TailoredCVKey: string;
  s3CoverLetterKey: string;
  s3JobDescKey: string;
  s3CompanyInfoKey?: string;
}

export interface CritiqueCVOutput {
  jobId: string;
  critiqueNotes: string;
  fitScore: number;
  fitVerdict?: "FIT" | "NO_FIT";
  fitRationale: string;
  likelihoodScore: number;
  likelihoodRationale: string;
  suggestedImprovements: string[];
  gapAnalysis: GapAdvice[];
  companySummary?: string;
  redFlags?: RedFlag[];
  hardFloorTriggers?: HardFloorRuleId[];
  normalizationSummary?: NormalizationSummary;
  policyAdjustments?: PolicyAdjustment[];
}

export interface GapAdvice {
  gap: string;
  advice: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export type RedFlagType =
  | "STABILITY_RISK"
  | "DEGREE_REQUIREMENT_MISSING";

export type RedFlagSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface RedFlag {
  type: RedFlagType;
  severity: RedFlagSeverity;
  description: string;
}

export type HardFloorRuleId =
  | "HF_REQUIRED_MASTERS_MISSING"
  | "HF_STABILITY_CONSEC_SHORT"
  | "HF_STABILITY_ROLE_CHURN";

export interface NormalizationSummary {
  seniority: string;
  requiredYears?: number;
  degreeRequirement?: string;
  uncertainLines: string[];
}

export interface PolicyAdjustment {
  ruleId: string;
  penalty: number;
  reason: string;
}

export interface RoleNormalization {
  rawJobDescription: string;
  seniority: string;
  requiredYears?: number;
  degreeRequirement?: "MASTERS" | "PHD";
  uncertainLines: string[];
}

export interface CritiqueResult {
  critiqueNotes: string;
  fitScore: number;
  fitVerdict?: "FIT" | "NO_FIT";
  fitRationale: string;
  likelihoodScore: number;
  likelihoodRationale: string;
  suggestedImprovements: string[];
  gapAnalysis: GapAdvice[];
  companySummary?: string;
  redFlags?: RedFlag[];
  hardFloorTriggers?: HardFloorRuleId[];
  normalizationSummary?: NormalizationSummary;
  policyAdjustments?: PolicyAdjustment[];
}

export interface PolicyEvaluationInput {
  modelResult: CritiqueResult;
  normalization: RoleNormalization;
  tailoredCV: string;
  coverLetter: string;
  jobDescription: string;
}

export interface PolicyEvaluationOutput {
  result: CritiqueResult;
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
