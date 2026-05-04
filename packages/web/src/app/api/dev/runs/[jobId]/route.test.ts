/**
 * @jest-environment node
 *
 * Unit tests for GET /api/dev/runs/[jobId].
 *
 * The SQLite module is mocked so no real DB file is created.
 */

jest.mock("@/lib/server/dev-db", () => ({
  getRun: jest.fn(),
}));

import { GET } from "./route";
import { getRun } from "@/lib/server/dev-db";
import type { RunDetail } from "@/lib/server/dev-db";

const mockGetRun = getRun as jest.MockedFunction<typeof getRun>;

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

function makeParams(jobId: string): { params: Promise<{ jobId: string }> } {
  return { params: Promise.resolve({ jobId }) };
}

describe("GET /api/dev/runs/[jobId] — production guard", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: originalEnv, writable: true });
    jest.clearAllMocks();
  });

  it("returns 404 in production", async () => {
    const res = await GET(new Request("http://localhost"), makeParams(VALID_UUID));
    expect(res.status).toBe(404);
    expect(mockGetRun).not.toHaveBeenCalled();
  });
});

describe("GET /api/dev/runs/[jobId]", () => {
  beforeEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", writable: true });
    jest.clearAllMocks();
  });

  it("returns 400 for a non-UUID jobId", async () => {
    const res = await GET(new Request("http://localhost"), makeParams("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockGetRun).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty jobId string", async () => {
    const res = await GET(new Request("http://localhost"), makeParams(""));
    expect(res.status).toBe(400);
    expect(mockGetRun).not.toHaveBeenCalled();
  });

  it("returns 404 when the run is not found in the DB", async () => {
    mockGetRun.mockReturnValueOnce(null);

    const res = await GET(new Request("http://localhost"), makeParams(VALID_UUID));
    expect(res.status).toBe(404);
    expect(mockGetRun).toHaveBeenCalledWith(VALID_UUID);
  });

  it("returns the full run detail on a cache hit", async () => {
    const run: RunDetail = {
      job_id: VALID_UUID,
      submitted_at: "2026-04-16T10:00:00.000Z",
      completed_at: "2026-04-16T10:01:00.000Z",
      fit_verdict: "FIT",
      fit_score: 85,
      jd_excerpt: "job description",
      resume_first_line: "my resume",
      resume_text: "my resume",
      jd_text: "job description",
      company_info: "Acme Corp",
      result: null,
    };
    mockGetRun.mockReturnValueOnce(run);

    const res = await GET(new Request("http://localhost"), makeParams(VALID_UUID));
    const data = await res.json() as unknown;

    expect(res.status).toBe(200);
    expect(data).toEqual(run);
    expect(mockGetRun).toHaveBeenCalledWith(VALID_UUID);
  });

  it("accepts a v1 UUID (non-v4) — the regex allows versions 1–5", async () => {
    // UUID version 1
    const v1Uuid = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    mockGetRun.mockReturnValueOnce(null);

    const res = await GET(new Request("http://localhost"), makeParams(v1Uuid));
    // 404 from the DB miss, not 400 from validation
    expect(res.status).toBe(404);
    expect(mockGetRun).toHaveBeenCalledWith(v1Uuid);
  });
});
