// KNOWN LIMITATIONS (do not fix here):
// - No user scoping — all runs visible to anyone with local server access.
// - SQLite is single-writer; concurrent dev server restarts could cause brief lock contention.
// - resume_text and jd_text are stored as plain text — no encryption at rest.
// - localStorage jd-<jobId> is still the source for the ATS cloud; if user clears storage
//   the chip cloud breaks (future: serve from GET /api/dev/runs/:jobId).
import "server-only";

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { TailoredOutput } from "@/lib/types";

const DB_PATH = path.join(process.cwd(), "dev-data", "results.db");

// Ensure dev-data directory exists.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Initialise schema on first open.
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    job_id        TEXT PRIMARY KEY,
    submitted_at  TEXT NOT NULL,
    completed_at  TEXT,
    fit_verdict   TEXT,
    fit_score     INTEGER,
    resume_text   TEXT,
    jd_text       TEXT,
    company_info  TEXT,
    result_json   TEXT
  );
`);

export interface RunRow {
  job_id: string;
  submitted_at: string;
  completed_at?: string | null;
  fit_verdict?: string | null;
  fit_score?: number | null;
  resume_text?: string | null;
  jd_text?: string | null;
  company_info?: string | null;
  result_json?: string | null;
}

export interface RunSummary {
  job_id: string;
  submitted_at: string;
  completed_at: string | null;
  fit_verdict: string | null;
  fit_score: number | null;
  /** First 300 chars of jd_text — enough to extract a title + one-line summary. */
  jd_excerpt: string | null;
  /** First 150 chars of resume_text — used to infer a resume identity label. */
  resume_first_line: string | null;
}

export interface RunDetail extends RunSummary {
  resume_text: string | null;
  jd_text: string | null;
  company_info: string | null;
  result: TailoredOutput | null;
}

const stmtUpsert = db.prepare<RunRow>(`
  INSERT INTO runs (job_id, submitted_at, completed_at, fit_verdict, fit_score, resume_text, jd_text, company_info, result_json)
  VALUES (@job_id, @submitted_at, @completed_at, @fit_verdict, @fit_score, @resume_text, @jd_text, @company_info, @result_json)
  ON CONFLICT(job_id) DO UPDATE SET
    completed_at  = COALESCE(@completed_at,  completed_at),
    fit_verdict   = COALESCE(@fit_verdict,   fit_verdict),
    fit_score     = COALESCE(@fit_score,     fit_score),
    resume_text   = COALESCE(@resume_text,   resume_text),
    jd_text       = COALESCE(@jd_text,       jd_text),
    company_info  = COALESCE(@company_info,  company_info),
    result_json   = COALESCE(@result_json,   result_json)
`);

const stmtList = db.prepare<[], RunSummary>(`
  SELECT job_id, submitted_at, completed_at, fit_verdict, fit_score,
         SUBSTR(jd_text, 1, 300)     AS jd_excerpt,
         SUBSTR(resume_text, 1, 150) AS resume_first_line
  FROM runs
  ORDER BY submitted_at DESC
`);

const stmtGet = db.prepare<[string], RunRow>(`
  SELECT * FROM runs WHERE job_id = ?
`);

const stmtDeleteAll = db.prepare(`DELETE FROM runs`);

/** Insert or update a run row. Null fields leave existing DB values unchanged. */
export function upsertRun(row: RunRow): void {
  stmtUpsert.run({
    job_id: row.job_id,
    submitted_at: row.submitted_at ?? null,
    completed_at: row.completed_at ?? null,
    fit_verdict: row.fit_verdict ?? null,
    fit_score: row.fit_score ?? null,
    resume_text: row.resume_text ?? null,
    jd_text: row.jd_text ?? null,
    company_info: row.company_info ?? null,
    result_json: row.result_json ?? null,
  });
}

/** Return summary list ordered by submitted_at DESC (no large text blobs). */
export function listRuns(): RunSummary[] {
  return stmtList.all();
}

/** Return full run detail including parsed result. Returns null if not found. */
export function getRun(jobId: string): RunDetail | null {
  const row = stmtGet.get(jobId);
  if (!row) return null;

  let result: TailoredOutput | null = null;
  if (row.result_json) {
    try {
      result = JSON.parse(row.result_json) as TailoredOutput;
    } catch {
      // malformed JSON — return null result rather than throwing
    }
  }

  return {
    job_id: row.job_id,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at ?? null,
    fit_verdict: row.fit_verdict ?? null,
    fit_score: row.fit_score ?? null,
    jd_excerpt: row.jd_text ? row.jd_text.slice(0, 300) : null,
    resume_first_line: row.resume_text ? row.resume_text.slice(0, 150) : null,
    resume_text: row.resume_text ?? null,
    jd_text: row.jd_text ?? null,
    company_info: row.company_info ?? null,
    result,
  };
}

/** Delete every run (used by the "Clear all" button in the dev UI). */
export function deleteAllRuns(): void {
  stmtDeleteAll.run();
}
