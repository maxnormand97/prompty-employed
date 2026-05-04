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
  requirementsCoverage?: RequirementCoverage[];
  confidenceScore?: number;
  normalizationSummary?: NormalizationSummary;
  policyAdjustments?: PolicyAdjustment[];
}

export interface GapAdvice {
  gap: string;
  advice: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export type RedFlagType =
  | "RECENCY_GAP"
  | "SCALE_MISMATCH"
  | "STABILITY_RISK"
  | "COMPLIANCE_DOMAIN_GAP"
  | "EVIDENCE_QUALITY"
  | "DEGREE_REQUIREMENT_MISSING"
  | "DOMAIN_EVIDENCE_MISSING";

export type RedFlagSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface RedFlag {
  type: RedFlagType;
  severity: RedFlagSeverity;
  description: string;
}

export type HardFloorRuleId =
  | "HF_DOMAIN_YEARS_SHORTFALL"
  | "HF_REQUIRED_MASTERS_MISSING"
  | "HF_NO_PRIMARY_DOMAIN_EVIDENCE"
  | "HF_SCALE_MISMATCH"
  | "HF_STABILITY_CONSEC_SHORT"
  | "HF_STABILITY_ROLE_CHURN";

export type RequirementCoverageStatus = "MET" | "PARTIAL" | "MISSING" | "WEAK_EVIDENCE";

export interface RequirementCoverage {
  requirement: string;
  status: RequirementCoverageStatus;
  evidenceSummary: string;
}

export interface NormalizationSummary {
  seniority: string;
  requiredYears?: number;
  mandatoryStack: string[];
  complianceSignals: string[];
  domainSignals: string[];
  scaleSignals: string[];
  stabilitySensitiveWording: string[];
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
  primaryDomain?: string;
  mandatoryStack: string[];
  complianceSignals: string[];
  domainSignals: string[];
  scaleSignals: string[];
  stabilitySensitiveWording: string[];
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
  requirementsCoverage?: RequirementCoverage[];
  confidenceScore?: number;
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
