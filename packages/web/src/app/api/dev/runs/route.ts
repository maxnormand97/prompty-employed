import { NextRequest, NextResponse } from "next/server";
import { upsertRun, listRuns, deleteAllRuns } from "@/lib/server/dev-db";
import type { TailoredOutput } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDev() {
  return process.env.NODE_ENV === "development";
}

function notFound() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

/**
 * GET /api/dev/runs
 *
 * Returns a summary list of all runs (no large text blobs).
 * Returns 404 outside development.
 */
export async function GET() {
  if (!isDev()) return notFound();

  const runs = listRuns();
  return NextResponse.json(runs);
}

/**
 * POST /api/dev/runs
 *
 * Creates or updates a run row with the initial submission data.
 * Returns 404 outside development.
 */
export async function POST(request: NextRequest) {
  if (!isDev()) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    jobId,
    submittedAt,
    resumeText,
    jdText,
    companyInfo,
    result,
  } = body as {
    jobId?: unknown;
    submittedAt?: unknown;
    resumeText?: unknown;
    jdText?: unknown;
    companyInfo?: unknown;
    result?: unknown;
  };

  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid or missing jobId" }, { status: 400 });
  }

  const resultData = result as TailoredOutput | undefined;

  upsertRun({
    job_id: jobId,
    submitted_at: typeof submittedAt === "string" ? submittedAt : new Date().toISOString(),
    resume_text: typeof resumeText === "string" ? resumeText : null,
    jd_text: typeof jdText === "string" ? jdText : null,
    company_info: typeof companyInfo === "string" ? companyInfo : null,
    ...(resultData
      ? {
          completed_at: resultData.completedAt ?? null,
          fit_verdict: resultData.fitVerdict ?? null,
          fit_score: resultData.fitScore ?? null,
          result_json: JSON.stringify(resultData),
        }
      : {}),
  });

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/dev/runs
 *
 * Attaches the AI result to an existing run row.
 * Returns 404 outside development.
 */
export async function PATCH(request: NextRequest) {
  if (!isDev()) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { jobId, result } = body as { jobId?: unknown; result?: unknown };

  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid or missing jobId" }, { status: 400 });
  }

  const resultData = result as TailoredOutput | undefined;

  upsertRun({
    job_id: jobId,
    ...(resultData
      ? {
          completed_at: resultData.completedAt ?? null,
          fit_verdict: resultData.fitVerdict ?? null,
          fit_score: resultData.fitScore ?? null,
          result_json: JSON.stringify(resultData),
        }
      : {}),
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/dev/runs
 *
 * Deletes all run rows from the local SQLite database.
 * Returns 404 outside development.
 */
export async function DELETE() {
  if (!isDev()) return notFound();

  deleteAllRuns();
  return NextResponse.json({ ok: true });
}
