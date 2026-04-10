/**
 * CritiqueCVLambda
 *
 * Node 2 of the TailorCVWorkflow Step Function.
 *
 * Responsibilities:
 *   1. Read the tailored CV, cover letter, and job description from S3.
 *   2. Update DynamoDB job record status to "CRITIQUE".
 *   3. Call Amazon Bedrock (Claude 3 Haiku) with a structured prompt to produce:
 *        - critiqueNotes       — qualitative feedback on the tailored CV
 *        - fitScore            — 0–100 CV quality / fit score (integer)
 *        - fitRationale        — one-paragraph CV quality explanation
 *        - likelihoodScore     — 0–100 likelihood of landing the role (integer)
 *        - likelihoodRationale — one-paragraph likelihood explanation
 *        - suggestedImprovements — array of quick-win strings
 *        - gapAnalysis         — array of { gap, advice, priority } objects
 *   4. Write the full analysis result as JSON to S3.
 *   5. Write the S3 key reference to the DynamoDB job record and set status to "COMPLETE".
 *
 * Environment variables (set by CDK):
 *   BEDROCK_MODEL_ID      — e.g. "anthropic.claude-3-haiku-20240307-v1:0"
 *   JOBS_TABLE_NAME       — DynamoDB table name ("PromptlyEmployedJobs")
 *   RESULTS_BUCKET_NAME   — S3 bucket name ("PromptlyEmployedResults")
 *
 * IAM requirements:
 *   - dynamodb:UpdateItem on the jobs table
 *   - bedrock:InvokeModel on the Bedrock model ARN
 *   - s3:GetObject on results/{jobId}/*
 *   - s3:PutObject on results/{jobId}/*
 */

import * as fs from "fs";
import * as path from "path";

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// ── Logging ────────────────────────────────────────────────────────────────

export function log(
  level: "info" | "warn" | "error",
  message: string,
  context?: Record<string, unknown>
): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    })
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Environment ────────────────────────────────────────────────────────────

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnv(): CritiqueCVEnv {
  return {
    bedrockModelId: getRequiredEnvVar("BEDROCK_MODEL_ID"),
    jobsTableName: getRequiredEnvVar("JOBS_TABLE_NAME"),
    resultsBucketName: getRequiredEnvVar("RESULTS_BUCKET_NAME"),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

export async function readS3Object(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<string> {
  log("info", "Reading S3 object", { bucket, key });
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  if (!response.Body) throw new Error(`Empty body for S3 key: ${key}`);
  return response.Body.transformToString("utf-8");
}

export async function writeS3Object(
  s3: S3Client,
  bucket: string,
  key: string,
  body: string,
  contentType = "application/json"
): Promise<void> {
  log("info", "Writing S3 object", { bucket, key, bytes: body.length, contentType });
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function setJobCritiquing(
  dynamo: DynamoDBClient,
  tableName: string,
  jobId: string
): Promise<void> {
  log("info", "Setting job status to CRITIQUE", { jobId });
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": { S: "CRITIQUE" } },
    })
  );
}

export async function setJobComplete(
  dynamo: DynamoDBClient,
  tableName: string,
  jobId: string,
  s3AnalysisKey: string,
  completedAt: string
): Promise<void> {
  log("info", "Setting job status to COMPLETE", { jobId, s3AnalysisKey, completedAt });
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: "SET #s = :s, completedAt = :ca, s3Key = :sk",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: "COMPLETE" },
        ":ca": { S: completedAt },
        ":sk": { S: s3AnalysisKey },
      },
    })
  );
}

export async function setJobFailed(
  dynamo: DynamoDBClient,
  tableName: string,
  jobId: string,
  errorMessage: string
): Promise<void> {
  log("info", "Setting job status to FAILED", { jobId, errorMessage });
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: "SET #s = :s, errorMessage = :e",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: "FAILED" },
        ":e": { S: errorMessage },
      },
    })
  );
}

/**
 * Build the critique prompt for Claude (Haiku).
 *
 * User-supplied text is wrapped in XML delimiter tags as recommended by Anthropic
 * to separate instructions from untrusted content (prompt injection mitigation).
 */
export function buildCritiquePrompt(
  tailoredCV: string,
  coverLetter: string,
  jobDescription: string
): string {
  return `You are an expert recruiter and career coach.

Analyse the tailored CV and cover letter against the job description below.
Respond with ONLY a valid JSON object — no markdown fences, no preamble — matching this exact schema:

{
  "critiqueNotes": "<qualitative feedback on the tailored CV>",
  "fitScore": <integer 0–100, CV quality / keyword alignment>,
  "fitRationale": "<one paragraph explaining the fit score>",
  "likelihoodScore": <integer 0–100, probability of landing the role>,
  "likelihoodRationale": "<one paragraph explaining the likelihood score>",
  "suggestedImprovements": ["<quick win 1>", "<quick win 2>", ...],
  "gapAnalysis": [
    {
      "gap": "<experience or skill gap>",
      "advice": "<specific, actionable advice to close this gap>",
      "priority": "<HIGH | MEDIUM | LOW>"
    }
  ]
}

Rules:
- fitScore and likelihoodScore MUST be whole integers between 0 and 100.
- Each gapAnalysis item MUST have non-empty "gap", "advice", and a "priority" of HIGH, MEDIUM, or LOW.
- Output ONLY the JSON object. Any deviation will cause a pipeline failure.

<tailored_cv>
${tailoredCV}
</tailored_cv>

<cover_letter>
${coverLetter}
</cover_letter>

<job_description>
${jobDescription}
</job_description>`;
}

export async function invokeBedrockText(
  bedrock: BedrockRuntimeClient,
  modelId: string,
  prompt: string
): Promise<string> {
  log("info", "Invoking Bedrock model", { modelId, promptLength: prompt.length });
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: Buffer.from(body),
    })
  );

  const parsed = JSON.parse(Buffer.from(response.body).toString("utf-8"));
  const text: string = parsed?.content?.[0]?.text;
  if (!text) throw new Error("Bedrock returned an empty or malformed response");
  log("info", "Bedrock response received", { responseLength: text.length });
  return text;
}

/**
 * Parse and validate the JSON critique response from Claude.
 * Validates both the top-level shape and the element shapes within arrays.
 */
export function parseCritiqueResponse(raw: string): CritiqueResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Bedrock response was not valid JSON: ${raw.slice(0, 200)}`);
  }

  const result = parsed as Record<string, unknown>;

  const fitScore = Number(result.fitScore);
  const likelihoodScore = Number(result.likelihoodScore);

  if (
    typeof result.critiqueNotes !== "string" ||
    !Number.isInteger(fitScore) ||
    fitScore < 0 ||
    fitScore > 100 ||
    typeof result.fitRationale !== "string" ||
    !Number.isInteger(likelihoodScore) ||
    likelihoodScore < 0 ||
    likelihoodScore > 100 ||
    typeof result.likelihoodRationale !== "string" ||
    !Array.isArray(result.suggestedImprovements) ||
    !Array.isArray(result.gapAnalysis)
  ) {
    throw new Error("Bedrock response failed schema validation");
  }

  if (!result.suggestedImprovements.every((item: unknown) => typeof item === "string")) {
    throw new Error(
      "Bedrock response failed schema validation: suggestedImprovements must be an array of strings"
    );
  }

  const validPriorities = new Set(["HIGH", "MEDIUM", "LOW"]);
  if (
    !result.gapAnalysis.every((item: unknown) => {
      if (typeof item !== "object" || item === null) return false;
      const g = item as Record<string, unknown>;
      return (
        typeof g.gap === "string" &&
        g.gap.trim() !== "" &&
        typeof g.advice === "string" &&
        g.advice.trim() !== "" &&
        typeof g.priority === "string" &&
        validPriorities.has(g.priority)
      );
    })
  ) {
    throw new Error(
      "Bedrock response failed schema validation: gapAnalysis items must have non-empty gap/advice strings and priority in {HIGH, MEDIUM, LOW}"
    );
  }

  return {
    critiqueNotes: result.critiqueNotes as string,
    fitScore,
    fitRationale: result.fitRationale as string,
    likelihoodScore,
    likelihoodRationale: result.likelihoodRationale as string,
    suggestedImprovements: result.suggestedImprovements as string[],
    gapAnalysis: result.gapAnalysis as GapAdvice[],
  };
}

// ── Core business logic ────────────────────────────────────────────────────

export async function runCritiqueCV(
  event: CritiqueCVInput,
  clients: CritiqueCVClients,
  env: CritiqueCVEnv
): Promise<CritiqueCVOutput> {
  const { jobId, s3TailoredCVKey, s3CoverLetterKey, s3JobDescKey } = event;
  const { s3, dynamo, bedrock } = clients;
  const { bedrockModelId, jobsTableName, resultsBucketName } = env;

  log("info", "runCritiqueCV started", {
    jobId,
    s3TailoredCVKey,
    s3CoverLetterKey,
    s3JobDescKey,
    bedrockModelId,
    jobsTableName,
    resultsBucketName,
  });

  // 1. Update status to CRITIQUE
  await setJobCritiquing(dynamo, jobsTableName, jobId);

  try {
    // 2. Fetch all artefacts from S3
    log("info", "Fetching S3 artefacts", { jobId });
    const [tailoredCV, coverLetter, jobDescription] = await Promise.all([
      readS3Object(s3, resultsBucketName, s3TailoredCVKey),
      readS3Object(s3, resultsBucketName, s3CoverLetterKey),
      readS3Object(s3, resultsBucketName, s3JobDescKey),
    ]);
    log("info", "S3 artefacts fetched", {
      jobId,
      tailoredCVLength: tailoredCV.length,
      coverLetterLength: coverLetter.length,
      jobDescLength: jobDescription.length,
    });

    // 3. Build prompt and call Bedrock
    const prompt = buildCritiquePrompt(tailoredCV, coverLetter, jobDescription);
    const rawResponse = await invokeBedrockText(bedrock, bedrockModelId, prompt);

    // 4. Parse and validate the response
    const result = parseCritiqueResponse(rawResponse);
    log("info", "Critique parsed", {
      jobId,
      fitScore: result.fitScore,
      likelihoodScore: result.likelihoodScore,
    });

    // 5. Write analysis JSON to S3
    const completedAt = new Date().toISOString();
    const s3AnalysisKey = `results/${jobId}/analysis.json`;
    await writeS3Object(
      s3,
      resultsBucketName,
      s3AnalysisKey,
      JSON.stringify({ ...result, jobId, completedAt }, null, 2)
    );

    // 6. Write s3Key reference to DynamoDB and set status to COMPLETE
    await setJobComplete(dynamo, jobsTableName, jobId, s3AnalysisKey, completedAt);

    log("info", "runCritiqueCV complete", {
      jobId,
      fitScore: result.fitScore,
      likelihoodScore: result.likelihoodScore,
    });

    return {
      jobId,
      critiqueNotes: result.critiqueNotes,
      fitScore: result.fitScore,
      fitRationale: result.fitRationale,
      likelihoodScore: result.likelihoodScore,
      likelihoodRationale: result.likelihoodRationale,
      suggestedImprovements: result.suggestedImprovements,
      gapAnalysis: result.gapAnalysis,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log("error", "runCritiqueCV failed", { jobId, error: errorMessage, stack });
    await setJobFailed(dynamo, jobsTableName, jobId, errorMessage);
    throw err;
  }
}

// ── Lambda handler ─────────────────────────────────────────────────────────

export async function handler(event: CritiqueCVInput): Promise<CritiqueCVOutput> {
  log("info", "CritiqueCVLambda handler invoked", { event });
  const env = loadEnv();
  log("info", "Environment loaded", {
    bedrockModelId: env.bedrockModelId,
    jobsTableName: env.jobsTableName,
    resultsBucketName: env.resultsBucketName,
  });
  const clients: CritiqueCVClients = {
    s3: new S3Client({}),
    dynamo: new DynamoDBClient({}),
    bedrock: new BedrockRuntimeClient({}),
  };
  try {
    return await runCritiqueCV(event, clients, env);
  } catch (err) {
    log("error", "CritiqueCVLambda handler error", {
      jobId: event.jobId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}

// ── Local development entry point ──────────────────────────────────────────

async function main(): Promise<void> {
  const testDataDir = path.join(__dirname, "../../test-data");
  const tailoredCV = fs.readFileSync(path.join(testDataDir, "sample-tailored-cv.txt"), "utf-8");
  const coverLetter = fs.readFileSync(path.join(testDataDir, "sample-cover-letter.txt"), "utf-8");
  const jobDesc = fs.readFileSync(path.join(testDataDir, "sample-job-desc.txt"), "utf-8");

  const mockEvent: CritiqueCVInput = {
    jobId: "local-test-job-001",
    s3TailoredCVKey: "results/local-test-job-001/tailored-cv.md",
    s3CoverLetterKey: "results/local-test-job-001/cover-letter.md",
    s3JobDescKey: "inputs/local-test-job-001/job-desc.txt",
  };

  const mockEnv: CritiqueCVEnv = {
    bedrockModelId: "anthropic.claude-3-haiku-20240307-v1:0",
    jobsTableName: "PromptlyEmployedJobs",
    resultsBucketName: "PromptlyEmployedResults",
  };

  const s3Store: Record<string, string> = {
    [mockEvent.s3TailoredCVKey]: tailoredCV,
    [mockEvent.s3CoverLetterKey]: coverLetter,
    [mockEvent.s3JobDescKey]: jobDesc,
  };

  const s3Stub = {
    send: async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        const key = (command as GetObjectCommand).input.Key!;
        const content = s3Store[key];
        if (!content) throw new Error(`Mock S3: key not found: ${key}`);
        return { Body: { transformToString: (_enc: string) => Promise.resolve(content) } };
      }
      if (command instanceof PutObjectCommand) {
        const { Key, Body } = (command as PutObjectCommand).input;
        s3Store[Key!] = Body as string;
        log("info", "[Mock S3] PutObject", { key: Key, bytes: (Body as string).length });
        return {};
      }
      throw new Error(`Mock S3: unhandled command type`);
    },
  } as unknown as S3Client;

  const dynamoStub = {
    send: async (command: unknown) => {
      if (command instanceof UpdateItemCommand) {
        const { Key, ExpressionAttributeValues } = (command as UpdateItemCommand).input;
        log("info", "[Mock DynamoDB] UpdateItem", {
          key: Key,
          status: ExpressionAttributeValues?.[":s"]?.S,
        });
        return {};
      }
      throw new Error(`Mock DynamoDB: unhandled command type`);
    },
  } as unknown as DynamoDBClient;

  const mockCritiquePayload = {
    critiqueNotes: "Strong alignment with the role requirements.",
    fitScore: 82,
    fitRationale: "The candidate has the required TypeScript and React experience.",
    likelihoodScore: 70,
    likelihoodRationale: "Good match but lacks Storybook experience mentioned in the JD.",
    suggestedImprovements: [
      "Add Storybook or Chromatic usage to experience section",
      "Quantify accessibility work with WCAG compliance metrics",
    ],
    gapAnalysis: [
      {
        gap: "No Storybook or visual regression testing experience",
        advice: "Build a small Storybook component library on GitHub to demonstrate the skill",
        priority: "HIGH",
      },
    ],
  };

  const bedrockStub = {
    send: async (_command: unknown) => {
      return {
        body: Buffer.from(JSON.stringify({ content: [{ text: JSON.stringify(mockCritiquePayload) }] })),
      };
    },
  } as unknown as BedrockRuntimeClient;

  const clients: CritiqueCVClients = { s3: s3Stub, dynamo: dynamoStub, bedrock: bedrockStub };

  log("info", "Starting local CritiqueCV run", { event: mockEvent });
  try {
    const result = await runCritiqueCV(mockEvent, clients, mockEnv);
    console.log("\n─── Result ───────────────────────────────────────────────");
    console.log(JSON.stringify(result, null, 2));
    console.log("\n─── Analysis JSON (S3 payload) ───────────────────────────");
    console.log(s3Store[`results/${mockEvent.jobId}/analysis.json`]);
  } catch (err) {
    log("error", "Local run failed", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
