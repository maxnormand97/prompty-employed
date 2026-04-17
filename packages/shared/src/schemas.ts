import { z } from "zod";

// ── Inbound payload ────────────────────────────────────────────────────────

export const JobSubmissionSchema = z.object({
  masterResume: z
    .string()
    .min(200, "Master resume must be at least 200 characters")
    .max(15000, "Master resume must not exceed 15 000 characters"),
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
