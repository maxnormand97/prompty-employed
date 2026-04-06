/**
 * CritiqueCVLambda — Reference Implementation
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
 *   5. Write all result fields to the DynamoDB job record and set status to "COMPLETE".
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

const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-haiku-20240307-v1:0";
const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const RESULTS_BUCKET_NAME = process.env.RESULTS_BUCKET_NAME!;

// ── Types ──────────────────────────────────────────────────────────────────

interface CritiqueCVInput {
  jobId: string;
  s3TailoredCVKey: string;
  s3CoverLetterKey: string;
  s3JobDescKey: string;
}

interface GapAdvice {
  gap: string;
  advice: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

interface CritiqueResult {
  critiqueNotes: string;
  fitScore: number;
  fitRationale: string;
  likelihoodScore: number;
  likelihoodRationale: string;
  suggestedImprovements: string[];
  gapAnalysis: GapAdvice[];
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
async function writeS3Object(key: string, body: string, contentType = "application/json"): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: RESULTS_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Update the DynamoDB job record on completion.
 */
async function setJobComplete(
  jobId: string,
  result: CritiqueResult,
  completedAt: string
): Promise<void> {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { jobId: { S: jobId } },
      UpdateExpression: [
        "SET #s = :s",
        "completedAt = :ca",
        "critiqueNotes = :cn",
        "fitScore = :fs",
        "fitRationale = :fr",
        "likelihoodScore = :ls",
        "likelihoodRationale = :lr",
        "suggestedImprovements = :si",
        "gapAnalysis = :ga",
      ].join(", "),
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: "COMPLETE" },
        ":ca": { S: completedAt },
        ":cn": { S: result.critiqueNotes },
        ":fs": { N: String(result.fitScore) },
        ":fr": { S: result.fitRationale },
        ":ls": { N: String(result.likelihoodScore) },
        ":lr": { S: result.likelihoodRationale },
        ":si": { S: JSON.stringify(result.suggestedImprovements) },
        ":ga": { S: JSON.stringify(result.gapAnalysis) },
      },
    })
  );
}

/**
 * Update the DynamoDB job record status to FAILED.
 */
async function setJobFailed(jobId: string, errorMessage: string): Promise<void> {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: JOBS_TABLE_NAME,
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
function buildCritiquePrompt(
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

/**
 * Call Amazon Bedrock (Claude) and return the raw text response.
 */
async function invokeBedrockText(prompt: string): Promise<string> {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2048,
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

/**
 * Parse and validate the JSON critique response from Claude.
 */
function parseCritiqueResponse(raw: string): CritiqueResult {
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
    !Number.isInteger(fitScore) || fitScore < 0 || fitScore > 100 ||
    typeof result.fitRationale !== "string" ||
    !Number.isInteger(likelihoodScore) || likelihoodScore < 0 || likelihoodScore > 100 ||
    typeof result.likelihoodRationale !== "string" ||
    !Array.isArray(result.suggestedImprovements) ||
    !Array.isArray(result.gapAnalysis)
  ) {
    throw new Error("Bedrock response failed schema validation");
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

// ── Handler ────────────────────────────────────────────────────────────────

export async function handler(event: CritiqueCVInput): Promise<void> {
  const { jobId, s3TailoredCVKey, s3CoverLetterKey, s3JobDescKey } = event;

  console.log(JSON.stringify({ message: "CritiqueCVLambda started", jobId }));

  // 1. Update status to CRITIQUE
  await dynamo.send(
    new UpdateItemCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { jobId: { S: jobId } },
      UpdateExpression: "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": { S: "CRITIQUE" } },
    })
  );

  // 2. Fetch all artefacts from S3
  const [tailoredCV, coverLetter, jobDescription] = await Promise.all([
    readS3Object(s3TailoredCVKey),
    readS3Object(s3CoverLetterKey),
    readS3Object(s3JobDescKey),
  ]);

  // 3. Build prompt and call Bedrock
  const prompt = buildCritiquePrompt(tailoredCV, coverLetter, jobDescription);
  const rawResponse = await invokeBedrockText(prompt);

  // 4. Parse and validate the response
  let result: CritiqueResult;
  try {
    result = parseCritiqueResponse(rawResponse);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await setJobFailed(jobId, errorMessage);
    throw err;
  }

  // 5. Write analysis JSON to S3
  const completedAt = new Date().toISOString();
  const s3AnalysisKey = `results/${jobId}/analysis.json`;
  await writeS3Object(s3AnalysisKey, JSON.stringify({ ...result, jobId, completedAt }, null, 2));

  // 6. Write results to DynamoDB and set status to COMPLETE
  await setJobComplete(jobId, result, completedAt);

  console.log(
    JSON.stringify({ message: "CritiqueCVLambda complete", jobId, fitScore: result.fitScore, likelihoodScore: result.likelihoodScore })
  );
}
