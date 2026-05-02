"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { RunSummary } from "@/lib/server/dev-db";
import type { RunDetail } from "@/lib/server/dev-db";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Parse a human-readable title and summary from the first ~300 chars of a
 * job description. The title is the first non-empty line; the summary is the
 * next meaningful content, trimmed to 120 chars.
 */
function parseJdIdentity(excerpt: string | null): { title: string | null; summary: string | null } {
  if (!excerpt) return { title: null, summary: null };
  const lines = excerpt
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const title = lines[0] ?? null;
  const summary =
    lines
      .slice(1)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 120)
      .trimEnd() || null;
  return { title, summary };
}

/**
 * Extract a resume identity label from the first line of resume text.
 * Typically this is the candidate's name or a header line.
 */
function parseResumeLabel(firstLine: string | null): string | null {
  if (!firstLine) return null;
  const line = firstLine.split("\n")[0]?.trim();
  return line || null;
}

function scoreColor(score: number | null, verdict: string | null): string {
  if (score == null) return "bg-muted";
  if (verdict === "NO_FIT" || score < 50) return "bg-red-500";
  if (score < 70) return "bg-amber-500";
  return "bg-green-500";
}

// ── Download helper ────────────────────────────────────────────────────────

function triggerTextDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadOutputs(jobId: string): Promise<void> {
  const res = await fetch(`/api/dev/runs/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch run detail");
  const detail = (await res.json()) as RunDetail;
  const result = detail.result;
  if (!result) throw new Error("No result data available for this run");

  const slug = jobId.slice(0, 8);
  if (result.tailoredCV) triggerTextDownload(`cv-${slug}.md`, result.tailoredCV);
  if (result.coverLetter) triggerTextDownload(`cover-letter-${slug}.md`, result.coverLetter);
}

// ── Component ──────────────────────────────────────────────────────────────

export function RunCard({ run }: { run: RunSummary }) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonData, setJsonData] = useState<RunDetail | null>(null);
  const [jsonLoading, setJsonLoading] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  async function handleToggleJson() {
    if (jsonOpen) {
      setJsonOpen(false);
      return;
    }
    setJsonOpen(true);
    if (jsonData) return; // already fetched
    setJsonLoading(true);
    setJsonError(null);
    try {
      const res = await fetch(`/api/dev/runs/${run.job_id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setJsonData((await res.json()) as RunDetail);
    } catch {
      setJsonError("Failed to load run data.");
    } finally {
      setJsonLoading(false);
    }
  }

  const { title, summary } = parseJdIdentity(run.jd_excerpt);
  const resumeLabel = parseResumeLabel(run.resume_first_line);
  const submittedAt = new Date(run.submitted_at);
  const absoluteDate = submittedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const relDate = relativeTime(run.submitted_at);

  const hasResult = !!run.completed_at && run.fit_verdict != null;
  const barColor = scoreColor(run.fit_score, run.fit_verdict);

  function handleResubmit() {
    // Store inputs in sessionStorage so the home page can recover them.
    sessionStorage.setItem(
      "resubmit-data",
      JSON.stringify({
        jobId: run.job_id,
      })
    );
    router.push("/");
  }

  async function handleDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadOutputs(run.job_id);
    } catch {
      setDownloadError("Download failed — run may not be complete yet.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
      <CardHeader className="pb-3">
        {/* Top row: title + score */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5 min-w-0">
            {/* Human-readable headline */}
            <Link
              href={`/jobs/${run.job_id}`}
              className="block text-sm font-semibold text-foreground hover:text-violet-400 transition-colors truncate leading-snug"
            >
              {title ?? (
                <span className="font-mono text-muted-foreground">{run.job_id}</span>
              )}
            </Link>
            {/* One-line JD summary */}
            {summary && (
              <p className="text-xs text-muted-foreground truncate leading-snug">{summary}…</p>
            )}
          </div>

          {/* Score badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {run.fit_score != null && (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {run.fit_score}%
              </span>
            )}
            {run.fit_verdict === "FIT" && (
              <Badge className="bg-green-600/20 text-green-400 border-green-600/30 hover:bg-green-600/30">
                FIT
              </Badge>
            )}
            {run.fit_verdict === "NO_FIT" && (
              <Badge className="bg-red-600/20 text-red-400 border-red-600/30 hover:bg-red-600/30">
                NO FIT
              </Badge>
            )}
            {!run.fit_verdict && (
              <Badge variant="outline" className="text-muted-foreground">
                —
              </Badge>
            )}
          </div>
        </div>

        {/* Score progress bar */}
        {run.fit_score != null && (
          <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${run.fit_score}%` }}
            />
          </div>
        )}
      </CardHeader>

      <Separator className="bg-border/40" />

      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Metadata row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {/* Relative + absolute timestamp */}
            <span title={absoluteDate} className="cursor-default tabular-nums">
              {relDate}
            </span>
            {run.completed_at ? (
              <>
                <span aria-hidden>·</span>
                <span className="text-green-500/80">Completed</span>
              </>
            ) : (
              <>
                <span aria-hidden>·</span>
                <span className="text-yellow-500/80">Pending</span>
              </>
            )}
            {/* Resume label */}
            {resumeLabel && (
              <>
                <span aria-hidden>·</span>
                <span
                  className="max-w-[14rem] truncate"
                  title={`Resume: ${resumeLabel}`}
                >
                  Resume: <span className="text-foreground/70">{resumeLabel}</span>
                </span>
              </>
            )}
            {/* Job ID — kept small for reference */}
            <span aria-hidden>·</span>
            <span className="font-mono text-[10px] opacity-40 select-all">{run.job_id}</span>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link
              href={`/jobs/${run.job_id}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              )}
            >
              View results
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleResubmit}
            >
              Resubmit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={handleDownload}
              disabled={downloading || !hasResult}
              title={!hasResult ? "Run not complete yet" : undefined}
            >
              {downloading ? "Downloading…" : "Download"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleToggleJson}
              aria-expanded={jsonOpen}
            >
              <span className="mr-1 text-[10px] transition-transform duration-200" style={{ display: "inline-block", transform: jsonOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
              JSON
            </Button>
          </div>
        </div>

        {downloadError && (
          <p className="mt-2 text-xs text-red-400">{downloadError}</p>
        )}

        {/* JSON accordion */}
        {jsonOpen && (
          <div className="mt-3 rounded-md border border-border/50 bg-black/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">result_json</span>
              {jsonData && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2)).catch(() => {});
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Copy
                </button>
              )}
            </div>
            <div className="overflow-auto max-h-96 p-3">
              {jsonLoading && (
                <p className="text-xs text-muted-foreground font-mono">Loading…</p>
              )}
              {jsonError && (
                <p className="text-xs text-red-400 font-mono">{jsonError}</p>
              )}
              {jsonData && !jsonLoading && (
                <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {JSON.stringify(jsonData, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
