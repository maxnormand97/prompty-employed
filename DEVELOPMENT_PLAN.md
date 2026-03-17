# DEVELOPMENT_PLAN.md — Applied Logic

> AI-powered job application pipeline. Automatically ingests job postings, runs Playwright-based scraping on Lambda, processes through an AI analysis brain via AWS Step Functions, and surfaces results through a Next.js 15 control plane.

---

## Project Overview

**Product:** Applied Logic
**Type:** AI Job Pipeline (monorepo)
**Date:** 2026-03-17

### Stack

| Layer | Technology |
|---|---|
| Frontend / Hosting | Next.js 15 (App Router) on AWS Amplify Hosting |
| Orchestration | AWS Step Functions (Express Workflows) |
| Scraping Runtime | Playwright on Docker-based AWS Lambda |
| AI Models | Amazon Bedrock — Claude 3.7 Sonnet (analysis) + Claude Haiku (critique/scoring) |
| Database | Amazon DynamoDB (job state + results) |
| Polling | Next.js API Routes → DynamoDB |
| Package Manager | pnpm workspaces |

### Monorepo Structure

```
/
├── packages/
│   ├── infra/          # AWS CDK stacks (Step Functions, Lambda, DynamoDB, Amplify)
│   ├── web/            # Next.js 15 application (App Router)
│   └── shared/         # TypeScript types, utilities, constants shared across packages
├── pnpm-workspace.yaml
├── package.json
└── DEVELOPMENT_PLAN.md
```

---

## Core TypeScript Interfaces

Defined in `packages/shared/src/types.ts` and imported across all packages.

```ts
// packages/shared/src/types.ts

export type JobStatus =
  | "PENDING"
  | "SCRAPING"
  | "ANALYSING"
  | "CRITIQUE"
  | "COMPLETE"
  | "FAILED";

export interface JobPayload {
  jobId: string;                      // UUID v4 — primary key in DynamoDB
  url: string;                        // Raw job posting URL submitted by user
  submittedAt: string;                // ISO 8601 timestamp
  status: JobStatus;
  userId?: string;                    // Optional — for multi-tenant future extension
  metadata?: Record<string, unknown>; // Arbitrary scrape-time metadata (source, region, etc.)
}

export interface CVOutput {
  jobId: string;           // FK → JobPayload.jobId
  completedAt: string;     // ISO 8601 timestamp
  jobTitle: string;
  company: string;
  location: string;
  salaryRange?: string;
  keyRequirements: string[]; // Extracted must-have skills / qualifications
  niceToHave: string[];      // Extracted preferred / bonus qualifications
  summary: string;           // Claude 3.7 Sonnet: 2–3 sentence role summary
  fitScore: number;          // 0–100: Claude Haiku critique score
  fitRationale: string;      // Claude Haiku: short scoring explanation
  redFlags: string[];        // Claude Haiku: identified risks or concerns
  rawMarkdown?: string;      // Full scraped page content (optional, for debugging)
}
```

---

## Sprint 1 — Ingestion

**Goal:** Accept a job URL, persist it to DynamoDB, and trigger the Step Functions workflow.

### Tasks

1. **Monorepo bootstrap**
   - Initialise `pnpm-workspace.yaml` declaring `packages/*`
   - Create `packages/shared`, `packages/web`, `packages/infra` with individual `package.json` files
   - Configure `tsconfig.base.json` at root; extend per package
   - Add `eslint`, `prettier`, and `turbo` (or `pnpm -r`) for cross-package scripting

2. **Shared types**
   - Publish `JobPayload`, `CVOutput`, and `JobStatus` in `packages/shared/src/types.ts`
   - Export via `packages/shared/src/index.ts`

3. **DynamoDB table design** (`packages/infra`)
   - Table name: `AppliedLogicJobs`
   - Partition key: `jobId` (String)
   - GSI: `userId-submittedAt-index` (for user-scoped listing, future-proofed)
   - TTL attribute: `expiresAt` (optional, for auto-cleanup)

4. **Ingestion API route** (`packages/web/src/app/api/jobs/route.ts`)
   - `POST /api/jobs` — validates URL, generates `jobId` (UUID), writes `JobPayload` with `status: "PENDING"` to DynamoDB, then calls `StartExecution` on the Step Functions state machine
   - `GET /api/jobs` — lists jobs for polling (returns `jobId`, `status`, `submittedAt`)

5. **Submission UI** (`packages/web/src/app/page.tsx`)
   - Single-field form: URL input → POST → redirect to `/jobs/[jobId]`
   - Basic loading state

### Acceptance Criteria

- Submitting a valid URL creates a DynamoDB record with `status: "PENDING"`
- Step Functions execution is started with the correct `jobId` input
- Invalid URLs (non-HTTP/HTTPS) return `400`

---

## Sprint 2 — Infrastructure

**Goal:** Stand up all AWS infrastructure via CDK and wire together Lambda, Step Functions, and Amplify.

### Tasks

1. **CDK stack scaffold** (`packages/infra/lib/applied-logic-stack.ts`)
   - Single `AppliedLogicStack` exporting all constructs
   - Deploy target: `us-east-1` (configurable via CDK context)

2. **Playwright Lambda (Docker)**
   - Dockerfile in `packages/infra/docker/playwright/`
   - Base image: `public.ecr.aws/lambda/nodejs:20` + Playwright Chromium install
   - Lambda function: `ScrapeJobLambda` — receives `{ jobId, url }`, runs Playwright, returns raw markdown/HTML, updates DynamoDB `status → "SCRAPING"`
   - Memory: 2048 MB, timeout: 5 min
   - ECR repository provisioned via CDK; image built + pushed in CI

3. **Step Functions Express Workflow**
   - States:
     1. `ScrapeJob` → invoke `ScrapeJobLambda`
     2. `AnalyseJob` → invoke `AnalyseLambda` (Bedrock: Claude 3.7 Sonnet)
     3. `CritiqueJob` → invoke `CritiqueLambda` (Bedrock: Claude Haiku)
     4. `PersistResult` → write `CVOutput` to DynamoDB, set `status → "COMPLETE"`
     5. `HandleFailure` (Catch on all states) → set `status → "FAILED"`, write error message
   - Status updates written to DynamoDB at each state transition

4. **IAM roles & policies**
   - Lambda execution roles: DynamoDB read/write, Bedrock `InvokeModel`
   - Step Functions execution role: Lambda invoke
   - Amplify service role: read SSM parameters for env vars

5. **Amplify Hosting**
   - Connect to repository (GitHub)
   - Build spec: `pnpm install && pnpm --filter web build`
   - Environment variables: `DYNAMODB_TABLE_NAME`, `STATE_MACHINE_ARN`, `AWS_REGION`
   - Branch: `main → production`, `develop → preview`

6. **CDK deploy pipeline**
   - `pnpm --filter infra cdk deploy` script
   - Outputs: State Machine ARN, DynamoDB table name (consumed as Amplify env vars)

### Acceptance Criteria

- `cdk deploy` completes without errors
- Playwright Lambda cold-starts successfully against a test URL
- Step Functions execution graph visible in AWS Console
- Amplify build succeeds from `main` branch

---

## Sprint 3 — AI Brain

**Goal:** Implement the two-model Bedrock analysis pipeline (Claude 3.7 Sonnet → Claude Haiku critique).

### Tasks

1. **`AnalyseLambda`** (`packages/infra/lambda/analyse/index.ts`)
   - Input: `{ jobId, rawMarkdown }`
   - Bedrock call: `anthropic.claude-3-7-sonnet` via `@aws-sdk/client-bedrock-runtime`
   - Prompt: structured extraction of `jobTitle`, `company`, `location`, `salaryRange`, `keyRequirements`, `niceToHave`, `summary`
   - Output: partial `CVOutput` (all fields except fit scoring)
   - Writes intermediate result to DynamoDB; updates `status → "ANALYSING"`

2. **`CritiqueLambda`** (`packages/infra/lambda/critique/index.ts`)
   - Input: `{ jobId, analysisResult }`
   - Bedrock call: `anthropic.claude-3-haiku` — cheaper model used purely for scoring
   - Prompt: given extracted job details, return `fitScore` (0–100), `fitRationale`, `redFlags`
   - Merges with analysis result to produce full `CVOutput`
   - Updates `status → "CRITIQUE"` on start, `status → "COMPLETE"` on success

3. **Prompt engineering** (`packages/shared/src/prompts.ts`)
   - `buildAnalysisPrompt(rawMarkdown: string): string`
   - `buildCritiquePrompt(analysis: Partial<CVOutput>): string`
   - Prompts enforce JSON output (using Bedrock's `response_format` or XML-tagged outputs)
   - Shared between Lambda packages and unit tests

4. **Response parsing & validation**
   - Zod schemas in `packages/shared/src/schemas.ts` for safe runtime parsing of Bedrock responses
   - Handles partial/malformed JSON gracefully; surfaces parse failures as `FAILED` status

5. **Bedrock model IDs & config** (`packages/shared/src/config.ts`)
   - Constants: `ANALYSIS_MODEL_ID`, `CRITIQUE_MODEL_ID`, `MAX_TOKENS_ANALYSIS`, `MAX_TOKENS_CRITIQUE`

### Acceptance Criteria

- End-to-end Step Functions execution produces a valid `CVOutput` in DynamoDB
- `fitScore` is always a number between 0–100
- Malformed Bedrock response sets `status: "FAILED"` with an error message — does not crash the state machine
- Unit tests pass for prompt builders and Zod schema parsers

---

## Sprint 4 — Control Plane

**Goal:** Build the Next.js UI for job tracking, result display, and real-time status polling.

### Tasks

1. **Polling hook** (`packages/web/src/hooks/useJobStatus.ts`)
   - `GET /api/jobs/[jobId]` — fetches `JobPayload` + `CVOutput` if available
   - Polls every 3 seconds while `status` is not `COMPLETE` or `FAILED`
   - Uses `SWR` or `React Query` with `refreshInterval`

2. **Job status API route** (`packages/web/src/app/api/jobs/[jobId]/route.ts`)
   - `GET` — reads from DynamoDB by `jobId`, returns `{ payload: JobPayload, output?: CVOutput }`
   - Returns `404` if `jobId` not found

3. **Job detail page** (`packages/web/src/app/jobs/[jobId]/page.tsx`)
   - Live status indicator: `PENDING → SCRAPING → ANALYSING → CRITIQUE → COMPLETE`
   - On `COMPLETE`: render full `CVOutput` — fit score gauge, key requirements list, red flags, summary
   - On `FAILED`: display error message with retry option (re-POSTs the same URL)

4. **Job list page** (`packages/web/src/app/jobs/page.tsx`)
   - Paginated list of all submitted jobs
   - Columns: URL (truncated), status badge, submitted time, fit score (if complete)
   - Link to individual job detail page

5. **UI component library**
   - `StatusBadge` — colour-coded per `JobStatus`
   - `FitScoreGauge` — visual 0–100 arc/ring component
   - `RequirementsList` — segmented list: key requirements vs. nice-to-have
   - `RedFlagList` — highlighted warning cards

6. **Error boundaries & loading states**
   - Suspense boundaries on data-fetching server components
   - Skeleton loaders while polling

7. **Amplify environment variable wiring**
   - `NEXT_PUBLIC_` prefixed vars for client-safe config (none contain secrets)
   - Server-only vars (DynamoDB table name, State Machine ARN) via Amplify environment settings

### Acceptance Criteria

- Submitting a URL and navigating to `/jobs/[jobId]` shows live status transitions
- `COMPLETE` state renders all `CVOutput` fields without layout breakage
- `FAILED` state shows a user-friendly error and a functioning retry button
- Polling stops once a terminal status (`COMPLETE` or `FAILED`) is reached

---

## Cross-Cutting Concerns

### Security

- All Lambda roles follow least-privilege (no `*` actions or resources)
- DynamoDB `jobId` is UUID v4 — not guessable; no auth bypass risk via enumeration
- Bedrock prompts never include raw user-controlled strings in unsanitised form — URL is passed as a data field, not injected into prompt text directly
- Amplify environment variables never exposed client-side unless `NEXT_PUBLIC_` prefixed

### Testing Strategy

| Layer | Approach |
|---|---|
| Shared types/schemas | Vitest unit tests |
| Prompt builders | Vitest unit tests with fixture inputs |
| Lambda handlers | Vitest + mocked `@aws-sdk` clients |
| Next.js API routes | Vitest + `next-test-api-route-handler` |
| E2E | Playwright (locally); skipped in CI until Sprint 4 complete |

### CI/CD

- GitHub Actions workflow: `pnpm install → lint → typecheck → test → cdk synth`
- Docker image build + ECR push on merge to `main`
- Amplify auto-deploys `web` package on merge to `main`

---

## Milestone Summary

| Sprint | Deliverable | Key Output |
|---|---|---|
| 1 — Ingestion | URL submission + DynamoDB write + SFN trigger | Working `/api/jobs` POST endpoint |
| 2 — Infrastructure | Full CDK stack deployed | All AWS resources live, Amplify hosted |
| 3 — AI Brain | Bedrock analysis + critique pipeline | Valid `CVOutput` written to DynamoDB |
| 4 — Control Plane | Next.js polling UI | End-to-end user flow complete |
