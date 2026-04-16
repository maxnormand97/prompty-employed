// This module must never be imported from client components.
import "server-only";

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Known limitations (do not fix in this PR):
// - No user scoping — all runs visible to anyone with local server access
// - SQLite is single-writer; concurrent dev server restarts could cause brief lock contention
// - resume_text and jd_text stored as plain text — no encryption at rest
// - localStorage jd-<jobId> is still the source for the ATS cloud; if user clears storage
//   the chip cloud breaks (future: serve from GET /api/dev/runs/:jobId)

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

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const dbDir = path.join(process.cwd(), "dev-data");
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "results.db");

  _db = new Database(dbPath);

  _db.exec(`
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

  return _db;
}

export function upsertRun(row: Partial<RunRow> & { job_id: string }): void {
  const db = getDb();

  // Fetch existing row so we can merge — allows partial updates (e.g. PATCH only sends result)
  const existing = db
    .prepare<[string], RunRow>("SELECT * FROM runs WHERE job_id = ?")
    .get(row.job_id);

  const merged: RunRow = {
    job_id: row.job_id,
    submitted_at: row.submitted_at ?? existing?.submitted_at ?? new Date().toISOString(),
    completed_at: row.completed_at !== undefined ? row.completed_at : (existing?.completed_at ?? null),
    fit_verdict: row.fit_verdict !== undefined ? row.fit_verdict : (existing?.fit_verdict ?? null),
    fit_score: row.fit_score !== undefined ? row.fit_score : (existing?.fit_score ?? null),
    resume_text: row.resume_text !== undefined ? row.resume_text : (existing?.resume_text ?? null),
    jd_text: row.jd_text !== undefined ? row.jd_text : (existing?.jd_text ?? null),
    company_info: row.company_info !== undefined ? row.company_info : (existing?.company_info ?? null),
    result_json: row.result_json !== undefined ? row.result_json : (existing?.result_json ?? null),
  };

  db.prepare<RunRow>(`
    INSERT OR REPLACE INTO runs
      (job_id, submitted_at, completed_at, fit_verdict, fit_score, resume_text, jd_text, company_info, result_json)
    VALUES
      ($job_id, $submitted_at, $completed_at, $fit_verdict, $fit_score, $resume_text, $jd_text, $company_info, $result_json)
  `).run(merged);
}

export interface RunSummary {
  job_id: string;
  submitted_at: string;
  completed_at: string | null;
  fit_verdict: string | null;
  fit_score: number | null;
}

export function listRuns(): RunSummary[] {
  const db = getDb();
  return db
    .prepare<[], RunSummary>(
      "SELECT job_id, submitted_at, completed_at, fit_verdict, fit_score FROM runs ORDER BY submitted_at DESC"
    )
    .all();
}

export function getRun(jobId: string): RunRow | null {
  const db = getDb();
  return db.prepare<[string], RunRow>("SELECT * FROM runs WHERE job_id = ?").get(jobId) ?? null;
}

export function deleteAllRuns(): void {
  const db = getDb();
  db.prepare("DELETE FROM runs").run();
}
