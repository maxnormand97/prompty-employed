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
import { normalizeJobDescription } from "./lib/normalization";
import { enforceCritiquePolicy } from "./lib/policy";
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
  fitVerdict: "FIT" as const,
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
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_PAYLOAD)) as never,
    });

    const result = await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    expect(result).toMatchObject({
      jobId: "test-job-001",
      fitScore: 85,
      fitVerdict: "FIT",
      likelihoodScore: 62,
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
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_PAYLOAD)) as never,
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
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_PAYLOAD)) as never,
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
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_PAYLOAD)) as never,
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
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_PAYLOAD)) as never,
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

  test("stores fitVerdict and fitScore in the COMPLETE DynamoDB update", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_PAYLOAD)) as never,
    });

    await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const completeCall = allCalls.find(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "COMPLETE"
    );
    const vals = completeCall?.args[0].input.ExpressionAttributeValues;
    expect(vals?.[":fv"]?.S).toBe("FIT");
    expect(vals?.[":fs"]?.N).toBe("85");
    const updateExpr = completeCall?.args[0].input.UpdateExpression ?? "";
    expect(updateExpr).toContain("fitScore = :fs");
    expect(updateExpr).toContain("fitVerdict = :fv");
  });

  test("omits fitVerdict attribute when Bedrock response has no fitVerdict", async () => {
    const payloadWithoutVerdict = { ...VALID_CRITIQUE_PAYLOAD };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (payloadWithoutVerdict as any).fitVerdict;

    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(JSON.stringify(payloadWithoutVerdict)) as never,
    });

    await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    const allCalls = dynamoMock.commandCalls(UpdateItemCommand);
    const completeCall = allCalls.find(
      (c) => c.args[0].input.ExpressionAttributeValues?.[":s"]?.S === "COMPLETE"
    );
    const vals = completeCall?.args[0].input.ExpressionAttributeValues;
    // fitScore always written; fitVerdict absent when not in response
    expect(vals?.[":fs"]?.N).toBe("85");
    expect(vals?.[":fv"]).toBeUndefined();
    const updateExpr = completeCall?.args[0].input.UpdateExpression ?? "";
    expect(updateExpr).toContain("fitScore = :fs");
    expect(updateExpr).not.toContain("fitVerdict");
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

describe("normalizeJobDescription", () => {
  test("extracts seniority, years, degree requirement and uncertainty markers", () => {
    const jd = [
      "Senior FinTech Platform Engineer",
      "Requires 6+ years experience in fintech domain.",
      "Mandatory stack: TypeScript, SQL, AWS, microservices.",
      "Must understand PCI-DSS and high availability systems.",
      "Nice to have: Rust and kernel-level debugging.",
      "Master's degree required.",
    ].join("\n");

    const normalized = normalizeJobDescription(jd);
    expect(normalized.seniority).toBe("SENIOR");
    expect(normalized.requiredYears).toBe(6);
    expect(normalized.degreeRequirement).toBe("MASTERS");
    expect(normalized.uncertainLines.length).toBeGreaterThan(0);
  });
});

describe("enforceCritiquePolicy", () => {
  function baseModelResult() {
    return {
      critiqueNotes: "baseline",
      fitScore: 88,
      fitRationale: "good",
      likelihoodScore: 86,
      likelihoodRationale: "good",
      suggestedImprovements: [],
      gapAnalysis: [],
    };
  }

  test("applies degree floor when JD requires masters and CV only shows bachelors", () => {
    const normalization = normalizeJobDescription(
      "Lead engineer role. Master's degree required. TypeScript and AWS required."
    );
    const { result } = enforceCritiquePolicy({
      modelResult: baseModelResult(),
      normalization,
      tailoredCV:
        "Education: Bachelor's in Computer Science. Experience includes TypeScript and AWS projects.",
      coverLetter: "I am excited for this role.",
      jobDescription: normalization.rawJobDescription,
    });

    expect(result.likelihoodScore).toBeLessThanOrEqual(35);
    expect(result.hardFloorTriggers).toContain("HF_REQUIRED_MASTERS_MISSING");
  });

  test("applies stability floors for consecutive short roles and role churn", () => {
    const normalization = normalizeJobDescription("Senior platform engineer with TypeScript and AWS.");
    const currentYear = new Date().getUTCFullYear();
    const cv = [
      `Role A ${currentYear - 1}-${currentYear - 1}`,
      `Role B ${currentYear - 2}-${currentYear - 2}`,
      `Role C ${currentYear - 3}-${currentYear - 3}`,
      `Role D ${currentYear - 4}-${currentYear - 4}`,
    ].join("\n");

    const { result } = enforceCritiquePolicy({
      modelResult: baseModelResult(),
      normalization,
      tailoredCV: cv,
      coverLetter: "impact focus",
      jobDescription: normalization.rawJobDescription,
    });

    expect(result.hardFloorTriggers).toEqual(
      expect.arrayContaining(["HF_STABILITY_CONSEC_SHORT", "HF_STABILITY_ROLE_CHURN"])
    );
    expect(result.likelihoodScore).toBeLessThanOrEqual(35);
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

  test("instructs model to output companySummary field", () => {
    const prompt = buildCritiquePrompt("cv", "letter", "job");
    expect(prompt).toContain('"companySummary"');
  });

  test("includes company info in XML tags when provided", () => {
    const prompt = buildCritiquePrompt("cv", "letter", "job", "Acme Corp — builds widgets");
    expect(prompt).toContain("<company_info>\nAcme Corp — builds widgets\n</company_info>");
  });

  test("does not include company_info XML section when omitted", () => {
    const prompt = buildCritiquePrompt("cv", "letter", "job");
    expect(prompt).not.toContain("<company_info>");
  });

  test("instructs model to penalise inflated skill claims in CV", () => {
    const prompt = buildCritiquePrompt("cv", "letter", "job");
    expect(prompt).toContain("Score the underlying");
  });
});

// ── runCritiqueCV with company info ────────────────────────────────────────

const COMPANY_INFO_TEXT = "Acme Corp — DevOps SaaS; values are speed, reliability, simplicity.";
const EVENT_WITH_COMPANY: CritiqueCVInput = {
  ...MOCK_EVENT,
  s3CompanyInfoKey: "inputs/test-job-001/company-info.txt",
};
const VALID_CRITIQUE_WITH_SUMMARY = {
  ...VALID_CRITIQUE_PAYLOAD,
  companySummary: "Acme Corp is a DevOps-focused SaaS company. Emphasise reliability experience.",
};

describe("runCritiqueCV — company info", () => {
  function setupS3WithCompany() {
    s3Mock
      .on(GetObjectCommand, { Key: EVENT_WITH_COMPANY.s3TailoredCVKey })
      .resolves({ Body: makeBodyStream(MOCK_TAILORED_CV) as never })
      .on(GetObjectCommand, { Key: EVENT_WITH_COMPANY.s3CoverLetterKey })
      .resolves({ Body: makeBodyStream(MOCK_COVER_LETTER) as never })
      .on(GetObjectCommand, { Key: EVENT_WITH_COMPANY.s3JobDescKey })
      .resolves({ Body: makeBodyStream(MOCK_JOB_DESC) as never })
      .on(GetObjectCommand, { Key: EVENT_WITH_COMPANY.s3CompanyInfoKey })
      .resolves({ Body: makeBodyStream(COMPANY_INFO_TEXT) as never });
    s3Mock.on(PutObjectCommand).resolves({});
  }

  test("fetches company info from S3 when s3CompanyInfoKey is provided", async () => {
    setupS3WithCompany();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_WITH_SUMMARY)) as never,
    });

    await runCritiqueCV(EVENT_WITH_COMPANY, makeClients(), MOCK_ENV);

    const getCalls = s3Mock.commandCalls(GetObjectCommand);
    const fetchedKeys = getCalls.map((c) => c.args[0].input.Key);
    expect(fetchedKeys).toContain(EVENT_WITH_COMPANY.s3CompanyInfoKey);
  });

  test("returns companySummary in result when present in Bedrock response", async () => {
    setupS3WithCompany();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_WITH_SUMMARY)) as never,
    });

    const result = await runCritiqueCV(EVENT_WITH_COMPANY, makeClients(), MOCK_ENV);

    expect(result.companySummary).toBe(VALID_CRITIQUE_WITH_SUMMARY.companySummary);
  });

  test("does not attempt to fetch company info when s3CompanyInfoKey is absent", async () => {
    setupDefaultS3Mocks();
    dynamoMock.on(UpdateItemCommand).resolves({});
    bedrockMock.on(InvokeModelCommand).resolves({
      body: makeBedrockBody(JSON.stringify(VALID_CRITIQUE_PAYLOAD)) as never,
    });

    await runCritiqueCV(MOCK_EVENT, makeClients(), MOCK_ENV);

    // Only tailored CV + cover letter + job desc should be read (3 GetObject calls)
    const getCalls = s3Mock.commandCalls(GetObjectCommand);
    expect(getCalls).toHaveLength(3);
  });
});

// ── parseCritiqueResponse — companySummary ─────────────────────────────────

describe("parseCritiqueResponse — companySummary", () => {
  test("parses companySummary when present in response", () => {
    const result = parseCritiqueResponse(JSON.stringify(VALID_CRITIQUE_WITH_SUMMARY));
    expect(result.companySummary).toBe(VALID_CRITIQUE_WITH_SUMMARY.companySummary);
  });

  test("returns undefined companySummary when field is absent", () => {
    const result = parseCritiqueResponse(JSON.stringify(VALID_CRITIQUE_PAYLOAD));
    expect(result.companySummary).toBeUndefined();
  });

  test("returns undefined companySummary when field is an empty string", () => {
    const result = parseCritiqueResponse(
      JSON.stringify({ ...VALID_CRITIQUE_PAYLOAD, companySummary: "   " })
    );
    expect(result.companySummary).toBeUndefined();
  });
});
