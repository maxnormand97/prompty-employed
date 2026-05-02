/**
 * @jest-environment node
 *
 * Unit tests for GET / POST / PATCH / DELETE /api/dev/runs.
 *
 * The SQLite module is mocked so no real DB file is created. Every test
 * restores NODE_ENV to "development" before running and clears mocks between
 * tests.
 */

jest.mock("@/lib/server/dev-db", () => ({
  upsertRun: jest.fn(),
  listRuns: jest.fn(),
  deleteAllRuns: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET, POST, PATCH, DELETE } from "./route";
import { upsertRun, listRuns, deleteAllRuns } from "@/lib/server/dev-db";

const mockUpsertRun = upsertRun as jest.MockedFunction<typeof upsertRun>;
const mockListRuns = listRuns as jest.MockedFunction<typeof listRuns>;
const mockDeleteAllRuns = deleteAllRuns as jest.MockedFunction<typeof deleteAllRuns>;

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

function makeRequest(method: string, body: unknown = null): NextRequest {
  return new NextRequest(`http://localhost/api/dev/runs`, {
    method,
    ...(body != null
      ? {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }
      : {}),
  });
}

function makeRawRequest(method: string, rawBody: string): NextRequest {
  return new NextRequest(`http://localhost/api/dev/runs`, {
    method,
    body: rawBody,
    headers: { "Content-Type": "application/json" },
  });
}

describe("dev/runs route — production guard", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: originalEnv, writable: true });
    jest.clearAllMocks();
  });

  it("GET returns 404 in production", async () => {
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("POST returns 404 in production", async () => {
    const res = await POST(makeRequest("POST", { jobId: VALID_UUID }));
    expect(res.status).toBe(404);
  });

  it("PATCH returns 404 in production", async () => {
    const res = await PATCH(makeRequest("PATCH", { jobId: VALID_UUID }));
    expect(res.status).toBe(404);
  });

  it("DELETE returns 404 in production", async () => {
    const res = await DELETE();
    expect(res.status).toBe(404);
  });
});

describe("GET /api/dev/runs", () => {
  beforeEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", writable: true });
    jest.clearAllMocks();
  });

  it("returns run summaries from listRuns()", async () => {
    const summaries = [
      {
        job_id: VALID_UUID,
        submitted_at: "2026-04-16T10:00:00.000Z",
        completed_at: "2026-04-16T10:01:00.000Z",
        fit_verdict: "FIT",
        fit_score: 82,
        jd_excerpt: "job description",
        resume_first_line: "my resume",
      },
    ];
    mockListRuns.mockReturnValueOnce(summaries);

    const res = await GET();
    const data = await res.json() as unknown;

    expect(res.status).toBe(200);
    expect(data).toEqual(summaries);
    expect(mockListRuns).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when no runs exist", async () => {
    mockListRuns.mockReturnValueOnce([]);

    const res = await GET();
    const data = await res.json() as unknown;

    expect(res.status).toBe(200);
    expect(data).toEqual([]);
  });
});

describe("POST /api/dev/runs", () => {
  beforeEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", writable: true });
    jest.clearAllMocks();
  });

  it("calls upsertRun and returns { ok: true } for a valid payload", async () => {
    const body = {
      jobId: VALID_UUID,
      submittedAt: "2026-04-16T10:00:00.000Z",
      resumeText: "my resume",
      jdText: "job description",
      companyInfo: "Acme Corp",
    };

    const res = await POST(makeRequest("POST", body));
    const data = await res.json() as unknown;

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockUpsertRun).toHaveBeenCalledTimes(1);
    expect(mockUpsertRun).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: VALID_UUID,
        submitted_at: "2026-04-16T10:00:00.000Z",
        resume_text: "my resume",
        jd_text: "job description",
        company_info: "Acme Corp",
      })
    );
  });

  it("returns 400 for a missing jobId", async () => {
    const res = await POST(makeRequest("POST", { submittedAt: "2026-04-16T10:00:00.000Z" }));
    expect(res.status).toBe(400);
    expect(mockUpsertRun).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-UUID jobId", async () => {
    const res = await POST(makeRequest("POST", { jobId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(mockUpsertRun).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    const res = await POST(makeRawRequest("POST", "{invalid json"));
    expect(res.status).toBe(400);
    expect(mockUpsertRun).not.toHaveBeenCalled();
  });

  it("stores null for optional fields when they are omitted", async () => {
    const res = await POST(makeRequest("POST", { jobId: VALID_UUID }));
    expect(res.status).toBe(200);
    expect(mockUpsertRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resume_text: null,
        jd_text: null,
        company_info: null,
        result_json: null,
      })
    );
  });
});

describe("PATCH /api/dev/runs", () => {
  beforeEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", writable: true });
    jest.clearAllMocks();
  });

  it("calls upsertRun with result fields and returns { ok: true }", async () => {
    const result: { fitVerdict: string; fitScore: number } = { fitVerdict: "FIT", fitScore: 76 };
    const body = { jobId: VALID_UUID, result };

    const res = await PATCH(makeRequest("PATCH", body));
    const data = await res.json() as unknown;

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockUpsertRun).toHaveBeenCalledTimes(1);
    expect(mockUpsertRun).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: VALID_UUID,
        fit_verdict: "FIT",
        fit_score: 76,
      })
    );
  });

  it("returns 400 for an invalid UUID", async () => {
    const res = await PATCH(makeRequest("PATCH", { jobId: "bad" }));
    expect(res.status).toBe(400);
    expect(mockUpsertRun).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    const res = await PATCH(makeRawRequest("PATCH", "{invalid json"));
    expect(res.status).toBe(400);
    expect(mockUpsertRun).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/dev/runs", () => {
  beforeEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", writable: true });
    jest.clearAllMocks();
  });

  it("calls deleteAllRuns and returns { ok: true }", async () => {
    const res = await DELETE();
    const data = await res.json() as unknown;

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockDeleteAllRuns).toHaveBeenCalledTimes(1);
  });
});
