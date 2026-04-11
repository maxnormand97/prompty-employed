/**
 * DraftCVLambda
 *
 * Node 1 of the TailorCVWorkflow Step Function.
 *
 * Responsibilities:
 *   1. Read resume and job description text from S3 using keys from the event.
 *   2. Update DynamoDB job record status to "DRAFTING".
 *   3. Call Amazon Bedrock (Claude 3.7 Sonnet) with a structured prompt to
 *      generate a tailored CV and cover letter in Markdown.
 *   4. Write tailored CV and cover letter to S3.
 *   5. Return S3 keys for the generated artefacts so the next state (CritiqueCVLambda)
 *      can locate them.
 *
 * Environment variables (set by CDK):
 *   BEDROCK_MODEL_ID      — e.g. "anthropic.claude-3-7-sonnet-20250219-v1:0"
 *   JOBS_TABLE_NAME       — DynamoDB table name ("PromptlyEmployedJobs")
 *   RESULTS_BUCKET_NAME   — S3 bucket name ("PromptlyEmployedResults")
 *
 * IAM requirements:
 *   - dynamodb:UpdateItem on the jobs table
 *   - bedrock:InvokeModel on the Bedrock model ARN
 *   - s3:GetObject on inputs/{jobId}/*
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
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context !== undefined ? { context } : {}),
  };

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface DraftCVInput {
  jobId: string;
  s3ResumeKey: string;
  s3JobDescKey: string;
}

export interface DraftCVOutput {
  jobId: string;
  s3TailoredCVKey: string;
  s3CoverLetterKey: string;
  s3JobDescKey: string;
}

export interface DraftCVClients {
  s3: S3Client;
  dynamo: DynamoDBClient;
  bedrock: BedrockRuntimeClient;
}

export interface DraftCVEnv {
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

export function loadEnv(): DraftCVEnv {
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
  body: string
): Promise<void> {
  log("info", "Writing S3 object", { bucket, key, bytes: body.length });
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/markdown; charset=utf-8",
    })
  );
}

export async function setJobStatus(
  dynamo: DynamoDBClient,
  tableName: string,
  jobId: string,
  status: "DRAFTING" | "FAILED",
  errorMessage?: string
): Promise<void> {
  log("info", "Setting job status", { jobId, status, errorMessage });
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: errorMessage
        ? "SET #s = :s, errorMessage = :e"
        : "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: status },
        ...(errorMessage ? { ":e": { S: errorMessage } } : {}),
      },
    })
  );
}

/**
 * Build the prompt for Claude (Sonnet) to draft a tailored CV and cover letter.
 *
 * User-supplied text is wrapped in XML delimiter tags as recommended by Anthropic
 * to separate instructions from untrusted content (prompt injection mitigation).
 */
export function buildDraftPrompt(resume: string, jobDescription: string): string {
  return `You are an expert career consultant and professional CV writer.

Your task is to produce TWO artefacts for the candidate below:

1. A TAILORED CV — rewrite the candidate's master resume so it is closely aligned
   to the target job description. Preserve factual accuracy; do not invent experience.
   Output the full CV in clean Markdown.

2. A COVER LETTER — write a compelling, specific cover letter for this role.
   Reference concrete achievements from the resume. Output in clean Markdown.

Separate the two artefacts with the exact delimiter line:
---COVER_LETTER_START---

<resume>
${resume}
</resume>

<job_description>
${jobDescription}
</job_description>

Respond with only the two Markdown artefacts separated by the delimiter. No preamble.`;
}

export async function invokeBedrockText(
  bedrock: BedrockRuntimeClient,
  modelId: string,
  prompt: string
): Promise<string> {
  log("info", "Invoking Bedrock model", { modelId, promptLength: prompt.length });
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
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

// ── Core business logic ────────────────────────────────────────────────────

export async function runDraftCV(
  event: DraftCVInput,
  clients: DraftCVClients,
  env: DraftCVEnv
): Promise<DraftCVOutput> {
  const { jobId, s3ResumeKey, s3JobDescKey } = event;
  const { s3, dynamo, bedrock } = clients;
  const { bedrockModelId, jobsTableName, resultsBucketName } = env;

  log("info", "runDraftCV started", {
    jobId,
    s3ResumeKey,
    s3JobDescKey,
    bedrockModelId,
    jobsTableName,
    resultsBucketName,
  });

  // 1. Update status to DRAFTING
  await setJobStatus(dynamo, jobsTableName, jobId, "DRAFTING");

  try {
    // 2. Fetch resume and job description text from S3
    log("info", "Fetching S3 artefacts", { jobId });
    const [resume, jobDescription] = await Promise.all([
      readS3Object(s3, resultsBucketName, s3ResumeKey),
      readS3Object(s3, resultsBucketName, s3JobDescKey),
    ]);
    log("info", "S3 artefacts fetched", {
      jobId,
      resumeLength: resume.length,
      jobDescLength: jobDescription.length,
    });

    // 3. Build prompt and call Bedrock
    const prompt = buildDraftPrompt(resume, jobDescription);
    const rawResponse = await invokeBedrockText(bedrock, bedrockModelId, prompt);

    // 4. Split response on delimiter
    const DELIMITER = "---COVER_LETTER_START---";
    const delimiterIndex = rawResponse.indexOf(DELIMITER);
    if (delimiterIndex === -1) {
      throw new Error("Bedrock response missing cover letter delimiter");
    }

    const tailoredCV = rawResponse.slice(0, delimiterIndex).trim();
    const coverLetter = rawResponse.slice(delimiterIndex + DELIMITER.length).trim();

    if (!tailoredCV || !coverLetter) {
      throw new Error("Bedrock response produced empty CV or cover letter");
    }

    log("info", "Response parsed", {
      jobId,
      tailoredCVLength: tailoredCV.length,
      coverLetterLength: coverLetter.length,
    });

    // 5. Write artefacts to S3
    const s3TailoredCVKey = `results/${jobId}/tailored-cv.md`;
    const s3CoverLetterKey = `results/${jobId}/cover-letter.md`;

    log("info", "Writing artefacts to S3", { jobId, s3TailoredCVKey, s3CoverLetterKey });
    await Promise.all([
      writeS3Object(s3, resultsBucketName, s3TailoredCVKey, tailoredCV),
      writeS3Object(s3, resultsBucketName, s3CoverLetterKey, coverLetter),
    ]);

    log("info", "runDraftCV complete", { jobId, s3TailoredCVKey, s3CoverLetterKey });

    // 6. Return S3 keys for the next Step Function state
    return { jobId, s3TailoredCVKey, s3CoverLetterKey, s3JobDescKey };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log("error", "runDraftCV failed", { jobId, error: errorMessage, stack });
    await setJobStatus(dynamo, jobsTableName, jobId, "FAILED", errorMessage);
    throw err;
  }
}

// ── Lambda handler ─────────────────────────────────────────────────────────

export async function handler(event: DraftCVInput): Promise<DraftCVOutput> {
  log("info", "DraftCVLambda handler invoked", { event });
  try {
    const env = loadEnv();
    log("info", "Environment loaded", {
      bedrockModelId: env.bedrockModelId,
      jobsTableName: env.jobsTableName,
      resultsBucketName: env.resultsBucketName,
    });
    const clients: DraftCVClients = {
      s3: new S3Client({}),
      dynamo: new DynamoDBClient({}),
      bedrock: new BedrockRuntimeClient({}),
    };
    return await runDraftCV(event, clients, env);
  } catch (err) {
    log("error", "DraftCVLambda handler error", {
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
  const resume = fs.readFileSync(path.join(testDataDir, "sample-resume.txt"), "utf-8");
  const jobDesc = fs.readFileSync(path.join(testDataDir, "sample-job-desc.txt"), "utf-8");

  const mockEvent: DraftCVInput = {
    jobId: "local-test-job-001",
    s3ResumeKey: "inputs/local-test-job-001/resume.txt",
    s3JobDescKey: "inputs/local-test-job-001/job-desc.txt",
  };

  const mockEnv: DraftCVEnv = {
    bedrockModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0",
    jobsTableName: "PromptlyEmployedJobs",
    resultsBucketName: "PromptlyEmployedResults",
  };

  // In-memory S3 store seeded with local test data
  const s3Store: Record<string, string> = {
    [mockEvent.s3ResumeKey]: resume,
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

  const DELIMITER = "---COVER_LETTER_START---";
  const bedrockStub = {
    send: async (_command: unknown) => {
      const tailoredCV = fs.readFileSync(
        path.join(testDataDir, "sample-tailored-cv.txt"),
        "utf-8"
      );
      const coverLetter = fs.readFileSync(
        path.join(testDataDir, "sample-cover-letter.txt"),
        "utf-8"
      );
      const responseText = `${tailoredCV}\n${DELIMITER}\n${coverLetter}`;
      return { body: Buffer.from(JSON.stringify({ content: [{ text: responseText }] })) };
    },
  } as unknown as BedrockRuntimeClient;

  const clients: DraftCVClients = { s3: s3Stub, dynamo: dynamoStub, bedrock: bedrockStub };

  log("info", "Starting local DraftCV run", { event: mockEvent });
  try {
    const result = await runDraftCV(mockEvent, clients, mockEnv);
    console.log("\n─── Result ───────────────────────────────────────────────");
    console.log(JSON.stringify(result, null, 2));
    console.log("\n─── Generated CV ─────────────────────────────────────────");
    console.log(s3Store[result.s3TailoredCVKey]);
    console.log("\n─── Cover Letter ─────────────────────────────────────────");
    console.log(s3Store[result.s3CoverLetterKey]);
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
