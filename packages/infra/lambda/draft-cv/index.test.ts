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

import {
  buildDraftPrompt,
  DraftCVClients,
  DraftCVEnv,
  DraftCVInput,
  runDraftCV,
} from "./index";

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

const MOCK_ENV: DraftCVEnv = {
  bedrockModelId: "test-model-id",
  jobsTableName: "TestJobs",
  resultsBucketName: "TestBucket",
};

const MOCK_EVENT: DraftCVInput = {
  jobId: "test-job-001",
  s3ResumeKey: "inputs/test-job-001/resume.txt",
  s3JobDescKey: "inputs/test-job-001/job-desc.txt",
};

const RESUME_TEXT = "Jane Smith\njane@example.com\nSoftware Engineer with 5 years exp";
const JOB_DESC_TEXT = "Senior Software Engineer — TypeScript required";
const TAILORED_CV_TEXT = "# Jane Smith\n\nSenior Software Engineer";
const COVER_LETTER_TEXT = "Dear Hiring Manager,\n\nI am applying for this role...";
const DELIMITER = "---COVER_LETTER_START---";

function makeBodyStream(content: string) {
  return { transformToString: (_enc: string) => Promise.resolve(content) };
}

function makeBedrockBody(text: string): Buffer {
  return Buffer.from(JSON.stringify({ content: [{ text }] }));
}

function makeClients(): DraftCVClients {
  return {
    s3: new S3Client({}),
    dynamo: new DynamoDBClient({}),
    bedrock: new BedrockRuntimeClient({}),
  };
}

// ── runDraftCV ─────────────────────────────────────────────────────────────

describe("runDraftCV", () => {
  test("returns correct S3 output keys on success", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3ResumeKey })
      .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
      .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never });
    s3Mock.on(PutObjectCommand).resolves({});
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}\n${COVER_LETTER_TEXT}`) as never,
    });

    const result = await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(result).toEqual({
      jobId: "test-job-001",
      s3TailoredCVKey: "results/test-job-001/tailored-cv.md",
      s3CoverLetterKey: "results/test-job-001/cover-letter.md",
      s3JobDescKey: MOCK_EVENT.s3JobDescKey,
    });
  });

  test("sets status to DRAFTING as the first DynamoDB call", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3ResumeKey })
      .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
      .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never });
    s3Mock.on(PutObjectCommand).resolves({});
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}\n${COVER_LETTER_TEXT}`) as never,
    });

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const firstCall = allCalls[0].args[0].input;
    expect(firstCall.ExpressionAttributeValues?.[":s"]?.S).toBe("DRAFTING");
  });

  test("writes both artefacts to S3 with correct keys", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3ResumeKey })
      .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
      .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never });
    s3Mock.on(PutObjectCommand).resolves({});
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}\n${COVER_LETTER_TEXT}`) as never,
    });

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    const writtenKeys = putCalls.map((c) => c.args[0].input.Key);
    expect(writtenKeys).toContain("results/test-job-001/tailored-cv.md");
    expect(writtenKeys).toContain("results/test-job-001/cover-letter.md");
  });

  test("throws and marks job FAILED when Bedrock response is missing delimiter", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3ResumeKey })
      .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
      .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never });
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody("No delimiter present in this response at all") as never,
    });

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "Bedrock response missing cover letter delimiter"
    );

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const hasFailedCall = allCalls.some(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "FAILED"
    );
    expect(hasFailedCall).toBe(true);
  });

  test("throws and marks job FAILED when Bedrock produces empty CV section", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3ResumeKey })
      .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
      .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never });
    dynamoMock.on(UpdateItemCommand).resolves({});
    // Delimiter at the very start → tailoredCV is empty
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(`${DELIMITER}\n${COVER_LETTER_TEXT}`) as never,
    });

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "Bedrock response produced empty CV or cover letter"
    );
  });

  test("throws and marks job FAILED when Bedrock produces empty cover letter section", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3ResumeKey })
      .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
      .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never });
    dynamoMock.on(UpdateItemCommand).resolves({});
    // Delimiter at the very end → coverLetter is empty
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}`) as never,
    });

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "Bedrock response produced empty CV or cover letter"
    );
  });

  test("throws and marks job FAILED when Bedrock returns empty response body", async () => {
    s3Mock
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3ResumeKey })
      .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
      .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
      .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never });
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody("") as never,
    });

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow();
  });

  test("throws and marks job FAILED when S3 read fails", async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error("S3 access denied"));
    dynamoMock.on(UpdateItemCommand).resolves({});

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "S3 access denied"
    );

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const hasFailedCall = allCalls.some(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "FAILED"
    );
    expect(hasFailedCall).toBe(true);
  });

  test("includes the error message in the FAILED DynamoDB update", async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error("Bucket not found"));
    dynamoMock.on(UpdateItemCommand).resolves({});

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow();

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const failedCall = allCalls.find(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "FAILED"
    );
    expect(failedCall?.args[0].input.ExpressionAttributeValues?.[":e"]?.S).toBe(
      "Bucket not found"
    );
  });
});

// ── buildDraftPrompt ───────────────────────────────────────────────────────

describe("buildDraftPrompt", () => {
  test("includes resume text in XML tags", () => {
    const prompt = buildDraftPrompt("MY RESUME CONTENT", "MY JOB DESC");
    expect(prompt).toContain("<resume>\nMY RESUME CONTENT\n</resume>");
  });

  test("includes job description text in XML tags", () => {
    const prompt = buildDraftPrompt("MY RESUME", "MY JOB DESC CONTENT");
    expect(prompt).toContain("<job_description>\nMY JOB DESC CONTENT\n</job_description>");
  });

  test("contains the cover letter delimiter instruction", () => {
    const prompt = buildDraftPrompt("r", "j");
    expect(prompt).toContain("---COVER_LETTER_START---");
  });
});
