import { NextRequest, NextResponse } from "next/server";
import { upsertRun, listRuns, deleteAllRuns } from "@/lib/server/dev-db";
import type { TailoredOutput } from "@/lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDev() {
  return process.env.NODE_ENV === "development";
}

/** GET /api/dev/runs — list all runs (summary only, no large text blobs) */
export async function GET() {
  if (!isDev()) return NextResponse.json({ error: "Not Found" }, { status: 404 });

  const rows = listRuns();
  return NextResponse.json(rows);
}

/** POST /api/dev/runs — create or update a run row */
export async function POST(request: NextRequest) {
  if (!isDev()) return NextResponse.json({ error: "Not Found" }, { status: 404 });

  const body = (await request.json()) as {
    jobId?: unknown;
    submittedAt?: unknown;
    resumeText?: unknown;
    jdText?: unknown;
    companyInfo?: unknown;
    result?: unknown;
  };

  const jobId = body.jobId;
  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  const submittedAt = typeof body.submittedAt === "string" ? body.submittedAt : new Date().toISOString();

  upsertRun({
    job_id: jobId,
    submitted_at: submittedAt,
    resume_text: typeof body.resumeText === "string" ? body.resumeText : null,
    jd_text: typeof body.jdText === "string" ? body.jdText : null,
    company_info: typeof body.companyInfo === "string" ? body.companyInfo : null,
    result_json: body.result != null ? JSON.stringify(body.result) : null,
  });

  return NextResponse.json({ ok: true });
}

/** PATCH /api/dev/runs — attach result to an existing row */
export async function PATCH(request: NextRequest) {
  if (!isDev()) return NextResponse.json({ error: "Not Found" }, { status: 404 });

  const body = (await request.json()) as { jobId?: unknown; result?: unknown };

  const jobId = body.jobId;
  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  const result = body.result as TailoredOutput | undefined;

  upsertRun({
    job_id: jobId,
    submitted_at: new Date().toISOString(), // will be ignored by COALESCE if row exists
    result_json: result != null ? JSON.stringify(result) : null,
    completed_at: result != null ? new Date().toISOString() : null,
    fit_verdict: result?.fitVerdict ?? null,
    fit_score: result?.fitScore ?? null,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/dev/runs — clear all runs */
export async function DELETE() {
  if (!isDev()) return NextResponse.json({ error: "Not Found" }, { status: 404 });

  deleteAllRuns();
  return NextResponse.json({ ok: true });
}
