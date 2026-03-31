# DEVELOPMENT_PLAN.md — Promptly Employed

> AI-powered job application engine. The user pastes their master experience list / resume and a target job description; an AWS Step Functions workflow uses Claude 3.7 Sonnet to produce a **tailored CV** and a **tailored cover letter**, then runs both through a Claude 3 Haiku analysis that scores CV quality, estimates the **likelihood of landing the role**, and produces a **gap analysis** with practical advice for each shortfall. All artefacts are stored in S3 (Markdown) and DynamoDB (metadata/status).

---

## Project Overview

**Product:** Promptly Employed
**Type:** AI CV Tailoring Pipeline (monorepo)
**Date:** 2026-03-25
**Current Phase:** Phase 1 — Core AI Tailoring Engine (MVP)

### Stack

| Layer | Technology |
|---|---|
| Frontend / Hosting | Next.js 15 (App Router) on AWS Amplify Hosting |
| Orchestration | Next.js API Route → AWS Step Functions (Express Workflow) |
| AI — Draft | Amazon Bedrock — Claude 3.7 Sonnet (tailored CV + cover letter drafting) |
| AI — Analyse | Amazon Bedrock — Claude 3 Haiku (CV quality score, likelihood score, gap analysis) |
| File Storage | Amazon S3 (tailored CV Markdown output + raw resume/JD payloads) |
| Metadata / Status | Amazon DynamoDB (job record + polling status) |
| Observability | AWS Lambda Powertools for TypeScript — structured logging, X-Ray tracing, custom metrics |
| Package Manager | pnpm workspaces |

---

## Phased Roadmap

### Phase 1 — Core AI Tailoring Engine (MVP) ← *current*

Manual input. The user provides both the raw text of their master resume and the target job description via text areas in the UI. No scraping, no external job board integration.

### Phase 2 — Automated Job Discovery (Future)

Replace the manual job description input with an automated pipeline:

- **SerpApi** — query Google Jobs for live Australian listings matching a target role/location
- **Playwright on Lambda** — scrape full job description text from **Seek** and **LinkedIn AU** for listings that lack structured data
- Same Step Functions CV tailoring workflow is reused unchanged downstream

---

## Monorepo Structure (pnpm workspaces)

```
/
├── packages/
│   ├── infra/                        # AWS CDK stack (all Phase 1 resources)
│   │   ├── lib/
│   │   │   ├── promptly-employed-stack.ts
│   │   │   └── constructs/
│   │   │       ├── storage-construct.ts      # S3 bucket + DynamoDB table
│   │   │       └── ai-pipeline-construct.ts  # Lambdas + Step Function + IAM
│   │   ├── lambda/
│   │   │   ├── draft-cv/             # DraftCVLambda — Claude 3.7 Sonnet
│   │   │   │   └── index.ts
│   │   │   └── critique-cv/          # CritiqueCVLambda — Claude 3 Haiku
│   │   │       └── index.ts
│   │   ├── cdk.json
│   │   └── package.json
│   ├── web/                          # Next.js 15 application (App Router)
│   │   ├── src/
│   │   │   └── app/
│   │   │       ├── page.tsx          # Manual input form (resume + JD)
│   │   │       ├── jobs/
│   │   │       │   └── [jobId]/
│   │   │       │       └── page.tsx  # Status polling + result display
│   │   │       └── api/
│   │   │           └── jobs/
│   │   │               ├── route.ts          # POST — submit job, upload inputs to S3
│   │   │               └── [jobId]/
│   │   │                   ├── route.ts      # GET — poll status
│   │   │                   └── stream/
│   │   │                       └── route.ts  # GET — SSE status stream
│   │   └── package.json
│   └── shared/                       # Zod schemas, types, prompt builders
│       ├── src/
│       │   ├── schemas.ts            # Zod schemas (source of truth)
│       │   ├── prompts.ts            # Prompt builder functions
│       │   └── index.ts              # Barrel export
│       └── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json
└── DEVELOPMENT_PLAN.md
```

---

## Zod Schemas (Phase 1)

Defined in `packages/shared/src/schemas.ts`. These are the canonical runtime types — TypeScript types are inferred from them via `z.infer`.

```ts
import { z } from "zod";

// ── Inbound payload ────────────────────────────────────────────────────────

export const JobSubmissionSchema = z.object({
  masterResume: z
    .string()
    .min(200, "Master resume must be at least 200 characters")
    .max(15000, "Master resume must not exceed 15 000 characters (~4 000 tokens)"),
  jobDescription: z
    .string()
    .min(50, "Job description must be at least 50 characters")
    .max(15000, "Job description must not exceed 15 000 characters (~4 000 tokens)"),
});

export type JobSubmission = z.infer<typeof JobSubmissionSchema>;

// ── Job lifecycle ──────────────────────────────────────────────────────────

export const JobStatusSchema = z.enum([
  "PENDING",   // record created, Step Function not yet started
  "DRAFTING",  // DraftCVLambda running (Claude 3.7 Sonnet)
  "CRITIQUE",  // CritiqueCVLambda running (Claude 3 Haiku)
  "COMPLETE",  // results persisted to S3 + DynamoDB
  "FAILED",    // terminal error at any stage
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

// ── DynamoDB record ────────────────────────────────────────────────────────

export const JobRecordSchema = z.object({
  jobId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  status: JobStatusSchema,
  s3Key: z.string().optional(),       // set once COMPLETE; path to Markdown in S3
  errorMessage: z.string().optional(), // set on FAILED
});

export type JobRecord = z.infer<typeof JobRecordSchema>;

// ── Step Function input/output ─────────────────────────────────────────────

// Raw text is written to S3 on submission; only S3 keys flow through the state
// machine to stay within the 256 KB Express Workflow payload limit.
export const StepFunctionInputSchema = z.object({
  jobId: z.string().uuid(),
  s3ResumeKey: z.string(),    // S3 key for the uploaded master resume
  s3JobDescKey: z.string(),   // S3 key for the uploaded job description
});

export type StepFunctionInput = z.infer<typeof StepFunctionInputSchema>;

// ── Gap analysis ──────────────────────────────────────────────────────────

export const GapAdviceSchema = z.object({
  gap: z.string(),                          // e.g. "No hands-on Kubernetes experience"
  advice: z.string(),                       // e.g. "Complete the free CKAD course on..."
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export type GapAdvice = z.infer<typeof GapAdviceSchema>;

// ── AI output ─────────────────────────────────────────────────────────────

export const TailoredOutputSchema = z.object({
  jobId: z.string().uuid(),
  completedAt: z.string().datetime(),

  // ── Draft artefacts (from Claude 3.7 Sonnet) ──────────────────────────
  tailoredCV: z.string().min(1),            // full CV rewritten to match the JD
  coverLetter: z.string().min(1),           // tailored cover letter for the role

  // ── Analysis (from Claude 3 Haiku) ────────────────────────────────────
  critiqueNotes: z.string().min(1),         // qualitative feedback on the tailored CV
  fitScore: z.number().int().min(0).max(100),      // 0–100 CV quality / fit score
  fitRationale: z.string(),                 // one-paragraph CV quality explanation
  likelihoodScore: z.number().int().min(0).max(100), // 0–100 probability of landing the role
  likelihoodRationale: z.string(),          // one-paragraph likelihood explanation
  suggestedImprovements: z.array(z.string()), // quick wins for the CV/cover letter
  gapAnalysis: z.array(GapAdviceSchema),    // experience gaps + prioritised practical advice
});

export type TailoredOutput = z.infer<typeof TailoredOutputSchema>;
```

---

## AWS CDK Resources (Phase 1)

Resources are decomposed into focused L3 constructs under `packages/infra/lib/constructs/`, composed by `PromptlyEmployedStack`.

| Construct | File | Responsibility |
|---|---|---|
| `StorageConstruct` | `constructs/storage-construct.ts` | S3 bucket + DynamoDB table |
| `AIPipelineConstruct` | `constructs/ai-pipeline-construct.ts` | Both Lambdas + Step Function + IAM |

Each construct accepts explicit props for any ARNs or names it depends on — no implicit cross-construct coupling.

### 1 — S3 Bucket: `PromptlyEmployedResults`

| Property | Value |
|---|---|
| Purpose | Store all AI-generated artefacts and raw input payloads |
| Key pattern | `inputs/{jobId}/resume.txt`, `inputs/{jobId}/job-description.txt` |
| | `results/{jobId}/tailored-cv.md` |
| | `results/{jobId}/cover-letter.md` |
| Versioning | Disabled (Phase 1) |
| Public access | Blocked — all access via Lambda role only |
| Lifecycle rule | Expire objects after 90 days |

### 2 — DynamoDB Table: `PromptlyEmployedJobs`

| Property | Value |
|---|---|
| Purpose | Job metadata, lifecycle status, and S3 key reference |
| Partition key | `jobId` (String, UUID v4) |
| Billing mode | PAY_PER_REQUEST |
| TTL attribute | `expiresAt` (auto-expire records after 30 days) |
| GSI | None required for Phase 1 (single-user, no multi-tenancy) |

### 3 — Lambda: `DraftCVLambda`

| Property | Value |
|---|---|
| Purpose | Node 1 of the Step Function — calls Claude 3.7 Sonnet to draft both the tailored CV and the cover letter in a single structured prompt |
| Runtime | Node.js 22.x |
| Handler | `packages/infra/lambda/draft-cv/index.handler` |
| Memory | 512 MB |
| Timeout | 5 minutes |
| Input | `{ jobId, s3ResumeKey, s3JobDescKey }` — raw text fetched from S3 inside the handler |
| Output | `{ jobId, tailoredCV, coverLetter }` — both written to S3; keys passed downstream |
| Bedrock model | Supplied via `BEDROCK_MODEL_ID` env var (set by CDK); default `anthropic.claude-3-7-sonnet-20250219-v1:0` |
| Environment vars | `BEDROCK_MODEL_ID`, `JOBS_TABLE_NAME`, `RESULTS_BUCKET_NAME` |
| Observability | Lambda Powertools — `Logger` (structured JSON + `jobId` correlation ID), `Tracer` (X-Ray subsegments around Bedrock + S3 calls) |
| IAM grants | DynamoDB `PutItem` / `UpdateItem`, Bedrock `InvokeModel`, S3 `GetObject` (resume/JD keys) + `PutObject` (CV + cover letter keys) |
| Status transition | Sets DynamoDB record to `DRAFTING` on start |

### 4 — Lambda: `CritiqueCVLambda`

| Property | Value |
|---|---|
| Purpose | Node 2 of the Step Function — calls Claude 3 Haiku to analyse the tailored CV against the JD; produces CV quality score, likelihood-of-hire score, gap analysis, and critique notes |
| Runtime | Node.js 22.x |
| Handler | `packages/infra/lambda/critique-cv/index.handler` |
| Memory | 256 MB |
| Timeout | 3 minutes |
| Input | `{ jobId, s3TailoredCVKey, s3CoverLetterKey, s3JobDescKey }` — artefacts fetched from S3 inside the handler |
| Output | `{ jobId, critiqueNotes, fitScore, fitRationale, likelihoodScore, likelihoodRationale, suggestedImprovements, gapAnalysis }` |
| Bedrock model | Supplied via `BEDROCK_MODEL_ID` env var (set by CDK); default `anthropic.claude-3-haiku-20240307-v1:0` |
| Environment vars | `BEDROCK_MODEL_ID`, `JOBS_TABLE_NAME`, `RESULTS_BUCKET_NAME` |
| Observability | Lambda Powertools — `Logger` (structured JSON + `jobId` correlation ID), `Tracer` (X-Ray subsegment around Bedrock call) |
| IAM grants | DynamoDB `UpdateItem`, Bedrock `InvokeModel`, S3 `GetObject` (CV + cover letter + JD keys) + `PutObject` (analysis results) |
| Status transition | Sets DynamoDB record to `CRITIQUE` on start, `COMPLETE` on success |

### 5 — Step Functions Express Workflow: `TailorCVWorkflow`

```
StartExecution (called from POST /api/jobs)
        │
        ▼
┌──────────────────┐     on error      ┌──────────────────┐
│  DraftCVLambda   │ ─────────────────▶│  HandleFailure   │
│  (Claude 3.7)    │                   │  status→FAILED   │
└────────┬─────────┘                   └──────────────────┘
         │
         ▼
┌──────────────────┐     on error      ┌──────────────────┐
│ CritiqueCVLambda │ ─────────────────▶│  HandleFailure   │
│  (Claude Haiku)  │                   │  status→FAILED   │
└────────┬─────────┘                   └──────────────────┘
         │
         ▼
      COMPLETE
  (S3 + DynamoDB written
   by CritiqueCVLambda)
```

| Property | Value |
|---|---|
| Type | Express Workflow (synchronous-style, async invocation from API) |
| Execution timeout | 10 minutes |
| Retry policy | `ThrottlingException` / `ServiceUnavailableException` on each Lambda task — 3 attempts, 2 s initial interval, backoff ×2.0 |
| Error handling | `Catch` on all states → `HandleFailure` — direct DynamoDB SDK integration (no Lambda; eliminates cold start and extra IAM surface) |
| IAM | Step Functions execution role with `lambda:InvokeFunction` on both Lambda ARNs + `dynamodb:UpdateItem` on the jobs table |

---

## Definition of Done — Phase 1

The Phase 1 MVP is complete when **all** of the following are true:

### Functional

- [ ] A user can paste a master resume (plain text) and a job description (plain text) into the web UI and submit the form
- [ ] Submitting writes resume and JD text to S3, creates a `JobRecord` in DynamoDB with `status: "PENDING"`, and triggers a Step Functions execution with S3 keys (not raw text)
- [ ] `DraftCVLambda` fetches resume/JD from S3, produces a tailored CV **and** a tailored cover letter in Markdown, and writes both to S3
- [ ] `CritiqueCVLambda` produces `critiqueNotes`, `fitScore` (0–100), `fitRationale`, `likelihoodScore` (0–100), `likelihoodRationale`, `suggestedImprovements`, and `gapAnalysis`
- [ ] Tailored CV is written to S3 at `results/{jobId}/tailored-cv.md`; cover letter at `results/{jobId}/cover-letter.md`
- [ ] DynamoDB record status progresses: `PENDING → DRAFTING → CRITIQUE → COMPLETE`
- [ ] The UI streams status updates via Server-Sent Events (`GET /api/jobs/[jobId]/stream`) and visually reflects each transition without polling
- [ ] On `COMPLETE`, the UI renders: tailored CV, cover letter, fit score + rationale, likelihood score + rationale, gap analysis (each gap with priority badge and practical advice), and suggested improvements
- [ ] On `FAILED`, the UI shows a clear error message and allows resubmission

### Infrastructure

- [ ] `pnpm --filter infra cdk deploy` completes without errors in a clean AWS account
- [ ] CDK stack is decomposed into `StorageConstruct` and `AIPipelineConstruct`; constructs communicate via explicit props (no implicit coupling)
- [ ] All IAM roles follow least-privilege (no wildcard actions or resources)
- [ ] S3 bucket has public access fully blocked
- [ ] DynamoDB TTL is configured and verified active
- [ ] Step Functions state machine has `Retry` blocks on both Lambda tasks for `ThrottlingException` and `ServiceUnavailableException`
- [ ] `HandleFailure` uses a direct DynamoDB SDK integration (not a Lambda) to set `status: "FAILED"`
- [ ] Bedrock model IDs are passed to Lambdas as CDK-managed environment variables — not hardcoded in Lambda source

### Quality

- [ ] Zod schemas validate all inbound API payloads; invalid submissions return `400` with a descriptive error
- [ ] `masterResume` and `jobDescription` inputs are rejected above 15 000 characters
- [ ] All Bedrock prompts wrap user-supplied text in XML delimiter tags (`<resume>`, `<job_description>`) — documented in `prompts.ts`
- [ ] Malformed or incomplete Bedrock responses do not crash the state machine — they set `status: "FAILED"` with a stored error message
- [ ] Unit tests pass for all Zod schemas, prompt builders, and Lambda handler logic (mocked AWS SDK)
- [ ] `fitScore` and `likelihoodScore` are always whole numbers in the range 0–100
- [ ] `gapAnalysis` items each have a `priority` of `HIGH`, `MEDIUM`, or `LOW` and non-empty `gap` and `advice` strings
- [ ] All Lambda handlers emit structured JSON logs via Lambda Powertools `Logger` with `jobId` on every line
- [ ] X-Ray trace spans are present for Bedrock and S3 calls within each Lambda

### Out of Scope for Phase 1

- Automated job board scraping (Seek, LinkedIn AU) — deferred to Phase 2
- Google Jobs search via SerpApi — deferred to Phase 2
- Multi-user / authentication
- CV version history or diffing
- Email notifications

---

## Cross-Cutting Concerns

### Security

- All Lambda execution roles are least-privilege — scoped to specific table/bucket ARNs, not `*`
- `jobId` is UUID v4 — not guessable; status polling does not expose other users' data
- Master resume and job description text are written to S3 with presigned access; only S3 keys flow through Step Functions input — raw text is never logged
- S3 bucket policy denies all public `GetObject`; only Lambda role may read/write
- API route validates and sanitises payload via Zod before passing to AWS SDK calls
- **Prompt injection mitigation:** user-supplied text is wrapped in XML delimiter tags (`<resume>…</resume>`, `<job_description>…</job_description>`) in all Bedrock prompts — Anthropic's recommended pattern for separating instructions from untrusted content; this design decision is documented in `prompts.ts`
- Zod schemas enforce `.max(15000)` on both inputs (~4 000 tokens) to bound Bedrock cost and reduce prompt-stuffing surface area

### Testing Strategy

| Layer | Approach |
|---|---|
| Zod schemas | Vitest unit tests — valid and invalid fixture inputs, including boundary values for min/max |
| Prompt builders | Vitest unit tests — assert XML delimiter tags present and required sections populated |
| Lambda handlers | Vitest + mocked `@aws-sdk` clients (`vi.mock`) + mocked Lambda Powertools |
| Next.js API routes | Vitest + `next-test-api-route-handler` |
| CDK stack | `cdk synth` in CI to catch misconfiguration early |

### Observability

- **Structured logging** — Lambda Powertools `Logger` on every handler; `jobId` injected as a persistent correlation key so all log lines from a single execution are trivially filterable in CloudWatch Logs Insights
- **Distributed tracing** — Lambda Powertools `Tracer` wraps Bedrock `InvokeModel` and S3 calls in X-Ray subsegments; the full Step Functions → Lambda → Bedrock call chain is visible in the X-Ray service map
- **Custom metrics** — Lambda Powertools `Metrics` emits EMF metrics for `BedrockLatencyMs`, `FitScore`, and `LikelihoodScore` per invocation; queryable in CloudWatch without log parsing

### CI/CD

- GitHub Actions: `pnpm install → lint → typecheck → test → cdk synth`
- Amplify auto-deploys `web` package on merge to `main`

---

## Milestone Summary

| Phase | Deliverable | Key Output |
|---|---|---|
| **Phase 1 — MVP** | Manual resume + JD → tailored CV, cover letter, likelihood score, gap analysis | Working end-to-end application pipeline |
| Phase 2 — Automation | SerpApi job discovery + Playwright scraper on Lambda | Fully automated pipeline for AU job boards |

---

## API Security (Prototype Phase)

For the prototype, the job submission API (POST `/api/jobs`) is **restricted to the project owner only** to prevent abuse and spamming of the AWS pipeline:

- All POST requests must include a secret header (e.g. `x-internal-api-key`) with a value matching an environment variable (`INTERNAL_API_KEY`).
- The secret is never exposed in frontend code or public repos.
- Any POST without the correct header receives a 403 Forbidden response.
- All GET routes (status polling, results) remain public for demo purposes.
- This approach is simple, effective for a portfolio prototype, and does not require AWS Cognito or IAM setup.

> **Note:** Once the system is fully tested and stable, this restriction can be removed or replaced with a more scalable authentication method (e.g. Cognito, OAuth, or public access with rate limiting) to allow public job submissions.
