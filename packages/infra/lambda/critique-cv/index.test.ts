import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";

import { buildCritiquePrompt } from "./lib/prompt";
import { parseCritiqueResponse } from "./lib/response";
import { CritiqueCVClients, CritiqueCVEnv, CritiqueCVInput } from "./lib/types";
import { runCritiqueCV } from "./core";

// ── Mock setup ─────────────────────────────────────────────────────────────

const s3Mock = mockClient(S3Client);
const dynamoMock = mockClient(DynamoDBClient);
const bedrockMock = mockClient(BedrockRuntimeClient);

beforeEach(() => {
  s3Mock.reset();
  dynamoMock.reset();
  bedrockMock.reset();
});

// ── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_ENV: CritiqueCVEnv = {
  bedrockModelId: "test-haiku-model",
  jobsTableName: "TestJobs",
  resultsBucketName: "TestBucket",
};

const MOCK_EVENT: CritiqueCVInput = {
  jobId: "test-job-001",
  s3TailoredCVKey: "results/test-job-001/tailored-cv.md",
  s3CoverLetterKey: "results/test-job-001/cover-letter.md",
  s3JobDescKey: "inputs/test-job-001/job-desc.txt",
};

const MOCK_TAILORED_CV = "# Jane Smith\n\nSenior Software Engineer";
const MOCK_COVER_LETTER = "Dear Hiring Manager,\n\nI am applying for this role...";
const MOCK_JOB_DESC = "Senior Software Engineer — TypeScript required";

const VALID_CRITIQUE_PAYLOAD = {
  critiqueNotes: "Strong alignment with the role requirements.",
  fitScore: 85,
  fitRationale: "The candidate has the required TypeScript and React experience.",
  likelihoodScore: 72,
  likelihoodRationale: "Good match but lacks Storybook experience mentioned in the JD.",
  suggestedImprovements: ["Add Storybook usage", "Quantify accessibility work"],
  gapAnalysis: [
    {
      gap: "No Storybook experience",
      advice: "Build a public Storybook demo project",
      priority: "HIGH",
    },
  ],
};

function makeBodyStream(content: string) {
  return { transformToString: (_enc: string) => Promise.resolve(content) };
}

function makeBedrockBody(text: string): Buffer {
  return Buffer.from(JSON.stringify({ stop_reason: "end_turn", content: [{ text }] }));
}

// invokeBedrockText prepends "{" to the continuation, so mocks must omit it.
function makeValidBedrockContinuation(): Buffer {
  return makeBedrockBody(JSON.stringify(VALID_CRITIQUE_PAYLOAD).slice(1));
}

function makeClients(): CritiqueCVClients {
  return {
    s3: new S3Client({}),
    dynamo: new DynamoDBClient({}),
    bedrock: new BedrockRuntimeClient({}),
  };
}

function setupDefaultS3Mocks() {
  s3Mock
    .on(GetObjectCommand, { Key: MOCK_EVENT.s3TailoredCVKey })
    .resolves({ Body: makeBodyStream(MOCK_TAILORED_CV) as never })
    .on(GetObjectCommand, { Key: MOCK_EVENT.s3CoverLetterKey })
    .resolves({ Body: makeBodyStream(MOCK_COVER_LETTER) as never })
    .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
    .resolves({ Body: makeBodyStream(MOCK_JOB_DESC) as never });
  s3Mock.on(PutObjectCommand).resolves({});
}

// ── runCritiqueCV ──────────────────────────────────────────────────────────

describe("runCritiqueCV", () => {
  test("returns correct output shape on success", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeValidBedrockContinuation() as never,
    });

    const result = await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(result).toMatchObject({
      jobId: "test-job-001",
      fitScore: 85,
      likelihoodScore: 72,
      critiqueNotes: VALID_CRITIQUE_PAYLOAD.critiqueNotes,
      fitRationale: VALID_CRITIQUE_PAYLOAD.fitRationale,
      likelihoodRationale: VALID_CRITIQUE_PAYLOAD.likelihoodRationale,
      suggestedImprovements: VALID_CRITIQUE_PAYLOAD.suggestedImprovements,
    });
    expect(result.gapAnalysis).toHaveLength(1);
    expect(result.gapAnalysis[0].priority).toBe("HIGH");
  });

  test("sets status to CRITIQUE as the first DynamoDB call", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeValidBedrockContinuation() as never,
    });

    await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const firstCall = allCalls[0].args[0].input;
    expect(firstCall.ExpressionAttributeValues?.[":s"]?.S).toBe("CRITIQUE");
  });

  test("sets status to COMPLETE after successful run", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeValidBedrockContinuation() as never,
    });

    await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const hasCompleteCall = allCalls.some(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "COMPLETE"
    );
    expect(hasCompleteCall).toBe(true);
  });

  test("writes analysis JSON to the correct S3 key", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeValidBedrockContinuation() as never,
    });

    await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    const analysisKey = `results/${MOCK_EVENT.jobId}/analysis.json`;
    const analysisWrite = putCalls.find((c) => c.args[0].input.Key === analysisKey);
    expect(analysisWrite).toBeDefined();
  });

  test("stores the s3Key reference in the COMPLETE DynamoDB update", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeValidBedrockContinuation() as never,
    });

    await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const completeCall = allCalls.find(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "COMPLETE"
    );
    expect(completeCall?.args[0].input.ExpressionAttributeValues?.[":sk"]?.S).toBe(
      `results/${MOCK_EVENT.jobId}/analysis.json`
    );
  });

  test("throws and marks job FAILED when Bedrock returns non-JSON", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody("This is not JSON at all") as never,
    });

    await expect(runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "Bedrock response was not valid JSON"
    );

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const hasFailedCall = allCalls.some(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "FAILED"
    );
    expect(hasFailedCall).toBe(true);
  });

  test("throws and marks job FAILED when Bedrock response fails schema validation", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(JSON.stringify({ ...VALID_CRITIQUE_PAYLOAD, fitScore: 999 }).slice(1)) as never,
    });

    await expect(runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "Bedrock response failed schema validation"
    );
  });

  test("throws and marks job FAILED when S3 read fails", async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error("S3 access denied"));
    dynamoMock.on(UpdateItemCommand).resolves({});

    await expect(runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "S3 access denied"
    );

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const hasFailedCall = allCalls.some(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "FAILED"
    );
    expect(hasFailedCall).toBe(true);
  });
});

// ── parseCritiqueResponse ──────────────────────────────────────────────────

describe("parseCritiqueResponse", () => {
  test("parses a valid response correctly", () => {
    const result = parseCritiqueResponse(JSON.stringify(VALID_CRITIQUE_PAYLOAD));
    expect(result.fitScore).toBe(85);
    expect(result.likelihoodScore).toBe(72);
    expect(result.suggestedImprovements).toHaveLength(2);
    expect(result.gapAnalysis[0].priority).toBe("HIGH");
  });

  test("throws on non-JSON input", () => {
    expect(() => parseCritiqueResponse("not json")).toThrow(
      "Bedrock response was not valid JSON"
    );
  });

  test("throws when fitScore is out of range (>100)", () => {
    expect(() =>
      parseCritiqueResponse(JSON.stringify({ ...VALID_CRITIQUE_PAYLOAD, fitScore: 101 }))
    ).toThrow("Bedrock response failed schema validation");
  });

  test("throws when fitScore is negative", () => {
    expect(() =>
      parseCritiqueResponse(JSON.stringify({ ...VALID_CRITIQUE_PAYLOAD, fitScore: -1 }))
    ).toThrow("Bedrock response failed schema validation");
  });

  test("throws when fitScore is not an integer", () => {
    expect(() =>
      parseCritiqueResponse(JSON.stringify({ ...VALID_CRITIQUE_PAYLOAD, fitScore: 85.5 }))
    ).toThrow("Bedrock response failed schema validation");
  });

  test("throws when likelihoodScore is missing", () => {
    const { likelihoodScore: _omit, ...rest } = VALID_CRITIQUE_PAYLOAD;
    expect(() => parseCritiqueResponse(JSON.stringify(rest))).toThrow(
      "Bedrock response failed schema validation"
    );
  });

  test("throws when suggestedImprovements contains a non-string", () => {
    expect(() =>
      parseCritiqueResponse(
        JSON.stringify({ ...VALID_CRITIQUE_PAYLOAD, suggestedImprovements: ["ok", 42] })
      )
    ).toThrow("suggestedImprovements must be an array of strings");
  });

  test("throws when gapAnalysis item has an invalid priority", () => {
    expect(() =>
      parseCritiqueResponse(
        JSON.stringify({
          ...VALID_CRITIQUE_PAYLOAD,
          gapAnalysis: [{ gap: "g", advice: "a", priority: "CRITICAL" }],
        })
      )
    ).toThrow("gapAnalysis items must have non-empty gap/advice strings");
  });

  test("throws when gapAnalysis item has an empty gap", () => {
    expect(() =>
      parseCritiqueResponse(
        JSON.stringify({
          ...VALID_CRITIQUE_PAYLOAD,
          gapAnalysis: [{ gap: "  ", advice: "a", priority: "LOW" }],
        })
      )
    ).toThrow("gapAnalysis items must have non-empty gap/advice strings");
  });

  test("accepts an empty gapAnalysis array", () => {
    const result = parseCritiqueResponse(
      JSON.stringify({ ...VALID_CRITIQUE_PAYLOAD, gapAnalysis: [] })
    );
    expect(result.gapAnalysis).toEqual([]);
  });

  test("accepts an empty suggestedImprovements array", () => {
    const result = parseCritiqueResponse(
      JSON.stringify({ ...VALID_CRITIQUE_PAYLOAD, suggestedImprovements: [] })
    );
    expect(result.suggestedImprovements).toEqual([]);
  });
});

// ── buildCritiquePrompt ────────────────────────────────────────────────────

describe("buildCritiquePrompt", () => {
  test("includes tailored CV in XML tags", () => {
    const prompt = buildCritiquePrompt("MY CV", "MY LETTER", "MY JOB");
    expect(prompt).toContain("<tailored_cv>\nMY CV\n</tailored_cv>");
  });

  test("includes cover letter in XML tags", () => {
    const prompt = buildCritiquePrompt("cv", "MY COVER LETTER", "job");
    expect(prompt).toContain("<cover_letter>\nMY COVER LETTER\n</cover_letter>");
  });

  test("includes job description in XML tags", () => {
    const prompt = buildCritiquePrompt("cv", "letter", "MY JOB DESCRIPTION");
    expect(prompt).toContain("<job_description>\nMY JOB DESCRIPTION\n</job_description>");
  });

  test("instructs model to output only JSON with the expected schema fields", () => {
    const prompt = buildCritiquePrompt("cv", "letter", "job");
    expect(prompt).toContain('"fitScore"');
    expect(prompt).toContain('"likelihoodScore"');
    expect(prompt).toContain('"gapAnalysis"');
    expect(prompt).toContain('"suggestedImprovements"');
  });
});
