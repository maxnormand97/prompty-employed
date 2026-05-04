import { z } from "zod";

// ── Inbound payload ────────────────────────────────────────────────────────

export const ResumeSourceSchema = z.enum(["manual", "upload"]);

export const ResumeFileTypeSchema = z.enum(["pdf", "docx", "txt"]);

export const ResumeRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  text: z
    .string()
    .min(200, "Resume text must be at least 200 characters")
    .max(15000, "Resume text must not exceed 15 000 characters"),
  source: ResumeSourceSchema,
  fileType: ResumeFileTypeSchema.optional(),
  mimeType: z.string().min(1).max(200).optional(),
  uploadedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().optional(),
});

export type ResumeSource = z.infer<typeof ResumeSourceSchema>;
export type ResumeFileType = z.infer<typeof ResumeFileTypeSchema>;
export type ResumeRecord = z.infer<typeof ResumeRecordSchema>;

export const JobSubmissionSchema = z.object({
  masterResume: z
    .string()
    .min(200, "Master resume must be at least 200 characters")
    .max(15000, "Master resume must not exceed 15 000 characters"),
  selectedResumeId: z.string().min(1).optional(),
  resumeName: z.string().min(1).max(200).optional(),
  resumeSource: ResumeSourceSchema.optional(),
  resumeFileType: ResumeFileTypeSchema.optional(),
  resumeMimeType: z.string().min(1).max(200).optional(),
  jobDescription: z
    .string()
    .min(50, "Job description must be at least 50 characters")
    .max(15000, "Job description must not exceed 15 000 characters"),
  companyInfo: z
    .string()
    .max(5000, "Company information must not exceed 5 000 characters")
    .optional(),
});

export type JobSubmission = z.infer<typeof JobSubmissionSchema>;

// ── Shared field schemas ───────────────────────────────────────────────────

export const FitVerdictSchema = z.enum(["FIT", "NO_FIT"]);
export const Score0to100Schema = z.number().int().min(0).max(100);

// ── Job lifecycle ──────────────────────────────────────────────────────────

export const JobStatusSchema = z.enum([
  "PENDING",
  "DRAFTING",
  "CRITIQUE",
  "COMPLETE",
  "FAILED",
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

// ── DynamoDB record ────────────────────────────────────────────────────────

export const JobRecordSchema = z.object({
  jobId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  status: JobStatusSchema,
  s3Key: z.string().optional(),
  errorMessage: z.string().optional(),
  // Analysis fields written by critique-cv lambda on COMPLETE.
  // Stored as top-level DynamoDB attributes for efficient list/filter queries
  // without fetching the full S3 result object.
  fitVerdict: FitVerdictSchema.optional(),
  fitScore: Score0to100Schema.optional(),
});

export type JobRecord = z.infer<typeof JobRecordSchema>;

// ── Step Function input ────────────────────────────────────────────────────

export const StepFunctionInputSchema = z.object({
  jobId: z.string().uuid(),
  s3ResumeKey: z.string(),
  s3JobDescKey: z.string(),
  selectedResumeId: z.string().min(1).optional(),
  resumeName: z.string().min(1).max(200).optional(),
  resumeSource: ResumeSourceSchema.optional(),
  resumeFileType: ResumeFileTypeSchema.optional(),
  resumeMimeType: z.string().min(1).max(200).optional(),
  s3CompanyInfoKey: z.string().optional(),
});

export type StepFunctionInput = z.infer<typeof StepFunctionInputSchema>;

// ── Gap analysis ──────────────────────────────────────────────────────────

export const GapAdviceSchema = z.object({
  gap: z.string(),
  advice: z.string(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export type GapAdvice = z.infer<typeof GapAdviceSchema>;

export const RedFlagSchema = z.object({
  type: z.enum([
    "STABILITY_RISK",
    "DEGREE_REQUIREMENT_MISSING",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  description: z.string().min(1),
});

export const HardFloorRuleIdSchema = z.enum([
  "HF_REQUIRED_MASTERS_MISSING",
  "HF_STABILITY_CONSEC_SHORT",
  "HF_STABILITY_ROLE_CHURN",
]);

export const NormalizationSummarySchema = z.object({
  seniority: z.string().min(1),
  requiredYears: z.number().int().min(0).optional(),
  degreeRequirement: z.string().optional(),
  uncertainLines: z.array(z.string()),
});

export const PolicyAdjustmentSchema = z.object({
  ruleId: z.string().min(1),
  penalty: z.number().int().min(0),
  reason: z.string().min(1),
});

// ── AI output ─────────────────────────────────────────────────────────────

export const TailoredOutputSchema = z.object({
  jobId: z.string().uuid(),
  completedAt: z.string().datetime(),

  /** "FIT" when the candidate passed pre-screening; "NO_FIT" when they didn't. */
  fitVerdict: FitVerdictSchema.optional(),
  /** One-sentence reason populated only on NO_FIT. */
  fitReason: z.string().optional(),

  /** Absent when fitVerdict is "NO_FIT" — no draft was generated. */
  tailoredCV: z.string().min(1).optional(),
  /** Absent when fitVerdict is "NO_FIT" — no draft was generated. */
  coverLetter: z.string().min(1).optional(),

  critiqueNotes: z.string().min(1),
  fitScore: Score0to100Schema,
  fitRationale: z.string(),
  likelihoodScore: Score0to100Schema,
  likelihoodRationale: z.string(),
  suggestedImprovements: z.array(z.string()),
  gapAnalysis: z.array(GapAdviceSchema),
  companySummary: z.string().optional(),
  redFlags: z.array(RedFlagSchema).optional(),
  hardFloorTriggers: z.array(HardFloorRuleIdSchema).optional(),
  normalizationSummary: NormalizationSummarySchema.optional(),
  policyAdjustments: z.array(PolicyAdjustmentSchema).optional(),
});

export type TailoredOutput = z.infer<typeof TailoredOutputSchema>;

// ── API response types ─────────────────────────────────────────────────────

export const JobSubmitResponseSchema = z.object({
  jobId: z.string().uuid(),
});

export type JobSubmitResponse = z.infer<typeof JobSubmitResponseSchema>;

export const JobStatusResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  errorMessage: z.string().optional(),
  result: TailoredOutputSchema.optional(),
});

export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
