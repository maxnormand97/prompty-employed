import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/server/dev-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDev() {
  return process.env.NODE_ENV === "development";
}

function notFound() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

/**
 * GET /api/dev/runs/[jobId]
 *
 * Returns full run data including jd_text, resume_text, and parsed result.
 * Returns 404 outside development or when the run is not found.
 * Validates that jobId is a valid UUID before any DB access.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  if (!isDev()) return notFound();

  const { jobId } = await params;

  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  const run = getRun(jobId);
  if (!run) return notFound();

  const result = run.result_json ? (JSON.parse(run.result_json) as unknown) : null;

  return NextResponse.json({
    job_id: run.job_id,
    submitted_at: run.submitted_at,
    completed_at: run.completed_at,
    fit_verdict: run.fit_verdict,
    fit_score: run.fit_score,
    jd_text: run.jd_text,
    resume_text: run.resume_text,
    company_info: run.company_info,
    result,
  });
}
