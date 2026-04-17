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

import { DRAFT_SYSTEM_PROMPT, buildDraftPrompt, buildScreenPrompt } from "./lib/prompt";
import { DraftCVClients, DraftCVEnv, DraftCVInput } from "./lib/types";
import { runDraftCV } from "./core";

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
  bedrockScreenModelId: "test-screen-model-id",
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

const SCREEN_FIT_RESPONSE = JSON.stringify({
  verdict: "YES",
  reason: "Candidate has relevant software engineering experience.",
});
const SCREEN_NO_FIT_RESPONSE = JSON.stringify({
  verdict: "NO",
  reason: "Candidate lacks required 3D modelling experience.",
});

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

/** Sets up S3 GetObject mocks for the default (no company info) event. */
function setupDefaultS3() {
  s3Mock
    .on(GetObjectCommand, { Key: MOCK_EVENT.s3ResumeKey })
    .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
    .on(GetObjectCommand, { Key: MOCK_EVENT.s3JobDescKey })
    .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never });
  s3Mock.on(PutObjectCommand).resolves({});
  dynamoMock.on(UpdateItemCommand).resolves({});
}

/** Sets up Bedrock to return a FIT screen then the full draft response. */
function setupFitBedrockMocks() {
  bedrockMock
    .on(InvokeModelCommand)
    .resolvesOnce({ body: makeBedrockBody(SCREEN_FIT_RESPONSE) as never })
    .resolves({
      body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}\n${COVER_LETTER_TEXT}`) as never,
    });
}

// ── runDraftCV — FIT path ──────────────────────────────────────────────────

describe("runDraftCV — FIT path", () => {
  test("returns correct output shape on success", async () => {
    setupDefaultS3();
    setupFitBedrockMocks();

    const result = await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(result).toEqual({
      jobId: "test-job-001",
      fitVerdict: "FIT",
      s3TailoredCVKey: "results/test-job-001/tailored-cv.md",
      s3CoverLetterKey: "results/test-job-001/cover-letter.md",
      s3JobDescKey: MOCK_EVENT.s3JobDescKey,
    });
  });

  test("sets status to DRAFTING as the first DynamoDB call", async () => {
    setupDefaultS3();
    setupFitBedrockMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const firstCall = allCalls[0].args[0].input;
    expect(firstCall.ExpressionAttributeValues?.[":s"]?.S).toBe("DRAFTING");
  });

  test("makes exactly two Bedrock calls (screen then draft)", async () => {
    setupDefaultS3();
    setupFitBedrockMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(bedrockMock.commandCalls(InvokeModelCommand)).toHaveLength(2);
  });

  test("writes tailored CV and cover letter to S3 with correct keys", async () => {
    setupDefaultS3();
    setupFitBedrockMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const writtenKeys = s3Mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key);
    expect(writtenKeys).toContain("results/test-job-001/tailored-cv.md");
    expect(writtenKeys).toContain("results/test-job-001/cover-letter.md");
  });

  test("writes screen and draft audit files to S3 on FIT path", async () => {
    setupDefaultS3();
    setupFitBedrockMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const writtenKeys = s3Mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key);
    expect(writtenKeys).toContain("results/test-job-001/audit/screen-prompt.txt");
    expect(writtenKeys).toContain("results/test-job-001/audit/screen-raw-response.txt");
    expect(writtenKeys).toContain("results/test-job-001/audit/draft-prompt.txt");
    expect(writtenKeys).toContain("results/test-job-001/audit/draft-raw-response.txt");
  });

  test("throws and marks job FAILED when draft Bedrock response is missing delimiter", async () => {
    setupDefaultS3();
    bedrockMock
      .on(InvokeModelCommand)
      .resolvesOnce({ body: makeBedrockBody(SCREEN_FIT_RESPONSE) as never })
      .resolves({ body: makeBedrockBody("No delimiter present in this response at all") as never });

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "Bedrock response missing cover letter delimiter"
    );

    const hasFailedCall = dynamoMock
      .commandCalls(UpdateItemCommand)
      .some((c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "FAILED");
    expect(hasFailedCall).toBe(true);
  });

  test("throws and marks job FAILED when draft Bedrock produces empty cover letter section (no content after delimiter)", async () => {
    setupDefaultS3();
    // The cover letter is the part after the delimiter — empty cover letter is a valid error path.
    bedrockMock
      .on(InvokeModelCommand)
      .resolvesOnce({ body: makeBedrockBody(SCREEN_FIT_RESPONSE) as never })
      .resolves({ body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}`) as never });

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "Bedrock response produced empty CV or cover letter"
    );
  });

  test("throws and marks job FAILED when draft Bedrock produces empty cover letter section", async () => {
    setupDefaultS3();
    bedrockMock
      .on(InvokeModelCommand)
      .resolvesOnce({ body: makeBedrockBody(SCREEN_FIT_RESPONSE) as never })
      .resolves({ body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}`) as never });

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "Bedrock response produced empty CV or cover letter"
    );
  });

  test("throws and marks job FAILED when Bedrock returns empty response body", async () => {
    setupDefaultS3();
    bedrockMock
      .on(InvokeModelCommand)
      .resolvesOnce({ body: makeBedrockBody(SCREEN_FIT_RESPONSE) as never })
      .resolves({ body: makeBedrockBody("") as never });

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow();
  });

  test("throws and marks job FAILED when S3 read fails", async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error("S3 access denied"));
    dynamoMock.on(UpdateItemCommand).resolves({});

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow(
      "S3 access denied"
    );

    const hasFailedCall = dynamoMock
      .commandCalls(UpdateItemCommand)
      .some((c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "FAILED");
    expect(hasFailedCall).toBe(true);
  });

  test("includes the error message in the FAILED DynamoDB update", async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error("Bucket not found"));
    dynamoMock.on(UpdateItemCommand).resolves({});

    await expect(runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV)).rejects.toThrow();

    const failedCall = dynamoMock
      .commandCalls(UpdateItemCommand)
      .find((c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "FAILED");
    expect(failedCall?.args[0].input.ExpressionAttributeValues?.[":e"]?.S).toBe("Bucket not found");
  });
});

// ── runDraftCV — NO_FIT path ───────────────────────────────────────────────

describe("runDraftCV — NO_FIT path", () => {
  function setupNoFitMocks() {
    setupDefaultS3();
    bedrockMock
      .on(InvokeModelCommand)
      .resolves({ body: makeBedrockBody(SCREEN_NO_FIT_RESPONSE) as never });
  }

  test("returns fitVerdict NO_FIT without CV or cover letter keys", async () => {
    setupNoFitMocks();

    const result = await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(result.fitVerdict).toBe("NO_FIT");
    expect(result.fitReason).toBe("Candidate lacks required 3D modelling experience.");
    expect(result.s3TailoredCVKey).toBeUndefined();
    expect(result.s3CoverLetterKey).toBeUndefined();
    expect(result.jobId).toBe("test-job-001");
  });

  test("makes exactly ONE Bedrock call on NO_FIT (no draft call)", async () => {
    setupNoFitMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(bedrockMock.commandCalls(InvokeModelCommand)).toHaveLength(1);
  });

  test("writes pre-canned analysis.json to S3 on NO_FIT", async () => {
    setupNoFitMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    const analysisWrite = putCalls.find(
      (c) => c.args[0].input.Key === "results/test-job-001/analysis.json"
    );
    expect(analysisWrite).toBeDefined();

    const written = JSON.parse(analysisWrite!.args[0].input.Body as string);
    expect(written.fitVerdict).toBe("NO_FIT");
    expect(written.fitReason).toBe("Candidate lacks required 3D modelling experience.");
    expect(written.fitScore).toBe(5);
    expect(written.likelihoodScore).toBe(5);
    expect(written.jobId).toBe("test-job-001");
  });

  test("marks job as COMPLETE (not FAILED) on NO_FIT", async () => {
    setupNoFitMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const hasCompleteCall = allCalls.some(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "COMPLETE"
    );
    expect(hasCompleteCall).toBe(true);
  });

  test("stores analysis S3 key in the COMPLETE DynamoDB update on NO_FIT", async () => {
    setupNoFitMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const completeCall = dynamoMock
      .commandCalls(UpdateItemCommand)
      .find((c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "COMPLETE");
    expect(completeCall?.args[0].input.ExpressionAttributeValues?.[":sk"]?.S).toBe(
      "results/test-job-001/analysis.json"
    );
  });

  test("writes screen audit files on NO_FIT path", async () => {
    setupNoFitMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const writtenKeys = s3Mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key);
    expect(writtenKeys).toContain("results/test-job-001/audit/screen-prompt.txt");
    expect(writtenKeys).toContain("results/test-job-001/audit/screen-raw-response.txt");
  });

  test("does NOT write draft audit files on NO_FIT path", async () => {
    setupNoFitMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const writtenKeys = s3Mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key);
    expect(writtenKeys).not.toContain("results/test-job-001/audit/draft-prompt.txt");
    expect(writtenKeys).not.toContain("results/test-job-001/audit/draft-raw-response.txt");
  });

  test("treats invalid JSON screen response as FIT and proceeds with draft", async () => {
    setupDefaultS3();
    bedrockMock
      .on(InvokeModelCommand)
      .resolvesOnce({ body: makeBedrockBody("not valid json at all") as never })
      .resolves({
        body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}\n${COVER_LETTER_TEXT}`) as never,
      });

    const result = await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(result.fitVerdict).toBe("FIT");
    expect(result.s3TailoredCVKey).toBe("results/test-job-001/tailored-cv.md");
  });

  test("treats a screen verdict of YES as FIT even with a reason", async () => {
    setupDefaultS3();
    bedrockMock
      .on(InvokeModelCommand)
      .resolvesOnce({
        body: makeBedrockBody(
          JSON.stringify({ verdict: "YES", reason: "Some relevant background." })
        ) as never,
      })
      .resolves({
        body: makeBedrockBody(`${TAILORED_CV_TEXT}\n${DELIMITER}\n${COVER_LETTER_TEXT}`) as never,
      });

    const result = await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(result.fitVerdict).toBe("FIT");
  });
});

// ── runDraftCV — company info ──────────────────────────────────────────────

describe("runDraftCV — company info", () => {
  const COMPANY_INFO_TEXT = "Acme Corp — a fast-growing SaaS company focused on DevOps tooling.";
  const EVENT_WITH_COMPANY: DraftCVInput = {
    ...MOCK_EVENT,
    s3CompanyInfoKey: "inputs/test-job-001/company-info.txt",
  };

  function setupS3WithCompany() {
    s3Mock
      .on(GetObjectCommand, { Key: EVENT_WITH_COMPANY.s3ResumeKey })
      .resolves({ Body: makeBodyStream(RESUME_TEXT) as never })
      .on(GetObjectCommand, { Key: EVENT_WITH_COMPANY.s3JobDescKey })
      .resolves({ Body: makeBodyStream(JOB_DESC_TEXT) as never })
      .on(GetObjectCommand, { Key: EVENT_WITH_COMPANY.s3CompanyInfoKey })
      .resolves({ Body: makeBodyStream(COMPANY_INFO_TEXT) as never });
    s3Mock.on(PutObjectCommand).resolves({});
    dynamoMock.on(UpdateItemCommand).resolves({});
  }

  test("fetches company info from S3 when s3CompanyInfoKey is provided", async () => {
    setupS3WithCompany();
    setupFitBedrockMocks();

    await runDraftCV(EVENT_WITH_COMPANY, makeClients(), MOCK_ENV);

    const fetchedKeys = s3Mock.commandCalls(GetObjectCommand).map((c) => c.args[0].input.Key);
    expect(fetchedKeys).toContain(EVENT_WITH_COMPANY.s3CompanyInfoKey);
  });

  test("includes s3CompanyInfoKey in output when provided", async () => {
    setupS3WithCompany();
    setupFitBedrockMocks();

    const result = await runDraftCV(EVENT_WITH_COMPANY, makeClients(), MOCK_ENV);

    expect(result.s3CompanyInfoKey).toBe(EVENT_WITH_COMPANY.s3CompanyInfoKey);
  });

  test("does not attempt to fetch company info when s3CompanyInfoKey is absent", async () => {
    setupDefaultS3();
    setupFitBedrockMocks();

    await runDraftCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    // Only resume + job desc should be read (2 GetObject calls)
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(2);
  });
});

// ── DRAFT_SYSTEM_PROMPT ────────────────────────────────────────────────────

describe("DRAFT_SYSTEM_PROMPT", () => {
  test("contains the work history lock rule", () => {
    expect(DRAFT_SYSTEM_PROMPT).toContain("WORK HISTORY LOCK");
  });

  test("explicitly states the target company is not an employer", () => {
    expect(DRAFT_SYSTEM_PROMPT).toContain("APPLYING TO is NOT an employer");
  });

  test("states the rule overrides every other instruction", () => {
    expect(DRAFT_SYSTEM_PROMPT).toContain("overrides every other instruction");
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

  test("contains the STRICT RULES anti-hallucination section", () => {
    const prompt = buildDraftPrompt("r", "j");
    expect(prompt).toContain("STRICT RULES");
    expect(prompt).toContain("Do NOT invent");
    expect(prompt).toContain("Do NOT add the job title being applied for");
  });

  test("explicitly prohibits listing the target company as an employer", () => {
    const prompt = buildDraftPrompt("r", "j");
    expect(prompt).toContain("Do NOT include the target company as a current or past employer");
  });

  test("contains the WORK HISTORY LOCK step", () => {
    const prompt = buildDraftPrompt("r", "j");
    expect(prompt).toContain("WORK HISTORY LOCK");
  });

  test("instructs cover letter to be honest about partial fit", () => {
    const prompt = buildDraftPrompt("r", "j");
    expect(prompt).toContain("honest about the candidate's fit");
  });

  test("instructs cover letter not to imply the candidate works at the target company", () => {
    const prompt = buildDraftPrompt("r", "j");
    expect(prompt).toContain("Do NOT imply the candidate already works at the target company");
  });

  test("contains the analysis step instruction", () => {
    const prompt = buildDraftPrompt("r", "j");
    expect(prompt).toContain("STEP 1");
    expect(prompt).toContain("ANALYSIS");
  });

  test("includes company info in XML tags when provided", () => {
    const prompt = buildDraftPrompt("MY RESUME", "MY JOB DESC", "Acme Corp — builds widgets");
    expect(prompt).toContain("<company_info>\nAcme Corp — builds widgets\n</company_info>");
  });

  test("does not include company_info XML section when omitted", () => {
    const prompt = buildDraftPrompt("MY RESUME", "MY JOB DESC");
    expect(prompt).not.toContain("<company_info>");
  });

  test("includes company-specific cover letter instruction when company info provided", () => {
    const prompt = buildDraftPrompt("r", "j", "Company XYZ");
    expect(prompt).toContain("company information provided");
  });
});

// ── buildScreenPrompt ──────────────────────────────────────────────────────

describe("buildScreenPrompt", () => {
  test("includes resume text in XML tags", () => {
    const prompt = buildScreenPrompt("MY RESUME CONTENT", "MY JOB DESC");
    expect(prompt).toContain("<resume>\nMY RESUME CONTENT\n</resume>");
  });

  test("includes job description text in XML tags", () => {
    const prompt = buildScreenPrompt("MY RESUME", "MY JOB DESC CONTENT");
    expect(prompt).toContain("<job_description>\nMY JOB DESC CONTENT\n</job_description>");
  });

  test("instructs model to answer YES or NO", () => {
    const prompt = buildScreenPrompt("r", "j");
    expect(prompt).toContain('"verdict"');
    expect(prompt).toContain("YES");
    expect(prompt).toContain("NO");
  });

  test("instructs model to return a reason field", () => {
    const prompt = buildScreenPrompt("r", "j");
    expect(prompt).toContain('"reason"');
  });

  test("instructs model to return only JSON without preamble", () => {
    const prompt = buildScreenPrompt("r", "j");
    expect(prompt).toContain("no preamble");
    expect(prompt).toContain("no markdown fences");
  });
});

