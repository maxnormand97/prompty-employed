# Promptly Employed

Promptly Employed is a Next.js app that helps a user paste in a master resume and a job description, then generates a tailored CV, a cover letter, and an honest fit assessment. The important part of the architecture is that the browser never talks to AWS directly. Instead, the Next.js app acts as the frontend and the thin server layer that brokers requests to AWS services.

## Why This Stack

We chose this stack because it keeps the product fast to build, secure to run, and simple to reason about.

### Why Next.js

Next.js gives us one codebase for the UI and the server endpoints that talk to AWS. That matters here because the app needs to:

- accept form submissions from the browser
- keep AWS credentials and internal API keys out of the client
- start background workflows in AWS
- stream progress updates back to the UI while the job runs

The main benefits are:

- **Single app, fewer moving parts.** The frontend and the server routes live together, so we do not need a separate API service for this product.
- **Secure server-side AWS access.** AWS SDK calls run only in Next.js route handlers and lambdas, not in browser code.
- **Built-in streaming support.** The job results page uses Server-Sent Events to show status updates as the workflow progresses.
- **Good product velocity.** App Router, TypeScript, and colocated route handlers make it easy to ship UI and backend changes together.
- **Easy deployment shape.** The app is naturally split into browser UI plus server logic, which maps well to modern hosting setups.

### Why the AWS pieces

The AWS services are chosen to match the type of work each step performs:

- **S3** stores the submitted text inputs and the generated outputs.
- **DynamoDB** stores lightweight job state such as `PENDING`, `DRAFTING`, `CRITIQUE`, `COMPLETE`, and `FAILED`.
- **Step Functions** orchestrates the multi-step workflow so the draft and critique stages run in order.
- **Amazon Bedrock** generates the tailored CV, cover letter, and critique analysis.

This split is useful because each service does one job well:

- S3 is cheap and good for larger text artifacts.
- DynamoDB is fast for status checks and simple job lookups.
- Step Functions is ideal for long-running orchestration and state transitions.
- Bedrock handles the AI generation work without having to manage model hosting ourselves.

## Frontend Setup

The frontend lives in the Next.js App Router app under `packages/web`.

### What We Use

- **Next.js 16 App Router** for pages, route handlers, and streaming responses
- **React 19** for the UI layer
- **TypeScript** for shared schema safety across the app and AWS pipeline
- **Tailwind CSS v4** for styling
- **shadcn-style components** for reusable UI primitives
- **@base-ui/react** as the low-level primitive layer behind some components
- **Geist** fonts for the page typography

### Why These Frontend Choices Work Well

- **Tailwind CSS v4** keeps styling fast, consistent, and local to the component.
- **shadcn-style components** give us accessible, composable UI without locking us into a heavy design system.
- **@base-ui/react** gives us low-level building blocks that stay flexible and accessible.
- **TypeScript + shared schemas** reduce drift between form validation, route handlers, and lambda inputs.
- **Geist fonts and the current theme setup** keep the interface clean and modern without extra asset overhead.

### Frontend Surfaces

- The homepage collects the master resume, job description, and optional company context.
- The `/resumes` page manages browser-local resumes.
- The job results page streams status updates and renders the generated output once the workflow finishes.

### Resume Handling

Resumes are stored locally in the browser for now, not in a server account profile. That keeps the experience simple and avoids introducing user authentication before it is needed.

- Uploaded files are parsed on the server through `POST /api/resumes/parse`.
- Stored resumes live in browser local storage.
- The selected resume can be passed through to job submission as metadata.

## How the App Talks to AWS

The browser submits data to Next.js route handlers, and those route handlers talk to AWS.

1. The user submits the form on the homepage.
2. `POST /api/jobs` validates the payload.
3. The route handler writes the raw inputs to S3.
4. The route handler creates a `PENDING` record in DynamoDB.
5. The route handler starts the Step Functions state machine.
6. Step Functions invokes the draft lambda.
7. The draft lambda reads inputs from S3, pre-screens with Bedrock, and either exits early with a `NO_FIT` result or writes the tailored CV and cover letter back to S3.
8. Step Functions invokes the critique lambda if the candidate is a fit.
9. The critique lambda reads the draft outputs, calls Bedrock again, writes `analysis.json` to S3, and marks the job `COMPLETE` in DynamoDB.
10. The UI opens `GET /api/jobs/[jobId]/stream` through `EventSource` and polls DynamoDB until the result is ready.
11. When the status becomes `COMPLETE`, the stream endpoint reads the final artefacts from S3 and sends the full result payload back to the browser.

The key design choice is that the browser only ever talks to Next.js. All AWS calls stay on the server side.

## Flow Diagram

```mermaid
flowchart LR
  User[User in Browser] --> UI[Next.js App Router UI]
  UI -->|POST /api/jobs| JobRoute[Next.js route handler]
  UI -->|EventSource /api/jobs/{jobId}/stream| StreamRoute[Next.js SSE route]

  JobRoute --> S3Inputs[(S3: input artefacts)]
  JobRoute --> JobsTable[(DynamoDB: jobs table)]
  JobRoute --> StateMachine[Step Functions workflow]

  StateMachine --> DraftLambda[Draft CV Lambda]
  DraftLambda --> S3Inputs
  DraftLambda --> JobsTable
  DraftLambda --> Bedrock1[Amazon Bedrock]
  DraftLambda --> S3Results[(S3: result artefacts)]

  StateMachine --> CritiqueLambda[Critique CV Lambda]
  CritiqueLambda --> S3Results
  CritiqueLambda --> JobsTable
  CritiqueLambda --> Bedrock2[Amazon Bedrock]

  StreamRoute --> JobsTable
  StreamRoute --> S3Results
  StreamRoute --> UI
```

## Project Structure

- `packages/web` - Next.js frontend and server route handlers
- `packages/infra/lambda/draft-cv` - first workflow lambda that drafts the tailored CV
- `packages/infra/lambda/critique-cv` - second workflow lambda that critiques and scores the draft
- `packages/shared` - shared schemas and types used across the app and lambdas

## Local Development

Requirements:

- Node.js 22 or newer
- pnpm 10 or newer

Common commands from the repo root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

The root scripts proxy into the web app and the workspace packages, so you can work from the repository root without jumping between folders.

## Important Runtime Inputs

The web app expects these server-side AWS values when it talks to the workflow:

- `AWS_REGION`
- `RESULTS_BUCKET_NAME`
- `JOBS_TABLE_NAME`
- `STATE_MACHINE_ARN`
- `INTERNAL_API_KEY` for request protection outside local development

## In Short

The stack is intentionally narrow:

- Next.js handles the user experience and the server bridge to AWS.
- AWS handles storage, orchestration, and AI inference.
- Tailwind, shadcn-style components, and Base UI keep the frontend fast to build and easy to maintain.

That combination gives us a modern UI, a secure server boundary, and a workflow that is easy to understand and extend.
