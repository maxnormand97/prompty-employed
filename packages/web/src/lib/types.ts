// Re-export all shared schemas and types from the centralised @prompty-employed/shared package.
// Do not duplicate schema definitions here — add them to packages/shared/src/schemas.ts instead.
export {
  JobSubmissionSchema,
  JobStatusSchema,
  GapAdviceSchema,
  TailoredOutputSchema,
  JobSubmitResponseSchema,
  JobStatusResponseSchema,
} from "@prompty-employed/shared";

export type {
  JobSubmission,
  JobStatus,
  GapAdvice,
  TailoredOutput,
  JobSubmitResponse,
  JobStatusResponse,
} from "@prompty-employed/shared";
