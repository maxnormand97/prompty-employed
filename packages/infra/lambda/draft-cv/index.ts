/**
 * DraftCVLambda — Reference Implementation
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

// ── AWS SDK clients ────────────────────────────────────────────────────────

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({});

// ── Environment variables ──────────────────────────────────────────────────

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const BEDROCK_MODEL_ID = getRequiredEnvVar("BEDROCK_MODEL_ID");
const JOBS_TABLE_NAME = getRequiredEnvVar("JOBS_TABLE_NAME");
const RESULTS_BUCKET_NAME = getRequiredEnvVar("RESULTS_BUCKET_NAME");

// ── Types ──────────────────────────────────────────────────────────────────

interface DraftCVInput {
  jobId: string;
  s3ResumeKey: string;
  s3JobDescKey: string;
}

interface DraftCVOutput {
  jobId: string;
  s3TailoredCVKey: string;
  s3CoverLetterKey: string;
  s3JobDescKey: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read a UTF-8 text object from S3.
 */
async function readS3Object(key: string): Promise<string> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: RESULTS_BUCKET_NAME, Key: key })
  );
  if (!response.Body) throw new Error(`Empty body for S3 key: ${key}`);
  return response.Body.transformToString("utf-8");
}

/**
 * Write a UTF-8 text object to S3.
 */
async function writeS3Object(key: string, body: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: RESULTS_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: "text/markdown; charset=utf-8",
    })
  );
}

/**
 * Update the DynamoDB job record status field.
 */
async function setJobStatus(
  jobId: string,
  status: "DRAFTING" | "FAILED",
  errorMessage?: string
): Promise<void> {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: JOBS_TABLE_NAME,
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
function buildDraftPrompt(resume: string, jobDescription: string): string {
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

/**
 * Call Amazon Bedrock (Claude) and return the raw text response.
 */
async function invokeBedrockText(prompt: string): Promise<string> {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: Buffer.from(body),
    })
  );

  const parsed = JSON.parse(Buffer.from(response.body).toString("utf-8"));
  const text: string = parsed?.content?.[0]?.text;
  if (!text) throw new Error("Bedrock returned an empty or malformed response");
  return text;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function handler(event: DraftCVInput): Promise<DraftCVOutput> {
  const { jobId, s3ResumeKey, s3JobDescKey } = event;

  console.log(JSON.stringify({ message: "DraftCVLambda started", jobId }));

  // 1. Update status to DRAFTING
  await setJobStatus(jobId, "DRAFTING");

  try {
    // 2. Fetch resume and job description text from S3
    const [resume, jobDescription] = await Promise.all([
      readS3Object(s3ResumeKey),
      readS3Object(s3JobDescKey),
    ]);

    // 3. Build prompt and call Bedrock
    const prompt = buildDraftPrompt(resume, jobDescription);
    const rawResponse = await invokeBedrockText(prompt);

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

    // 5. Write artefacts to S3
    const s3TailoredCVKey = `results/${jobId}/tailored-cv.md`;
    const s3CoverLetterKey = `results/${jobId}/cover-letter.md`;

    await Promise.all([
      writeS3Object(s3TailoredCVKey, tailoredCV),
      writeS3Object(s3CoverLetterKey, coverLetter),
    ]);

    console.log(
      JSON.stringify({ message: "DraftCVLambda complete", jobId, s3TailoredCVKey, s3CoverLetterKey })
    );

    // 6. Return S3 keys for the next Step Function state
    return {
      jobId,
      s3TailoredCVKey,
      s3CoverLetterKey,
      s3JobDescKey,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, "FAILED", errorMessage);
    throw err;
  }
}
