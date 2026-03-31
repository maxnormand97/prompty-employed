"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { JobStatus, TailoredOutput, GapAdvice } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────

type SSEPayload =
  | { status: "PENDING" | "DRAFTING" | "CRITIQUE" }
  | { status: "COMPLETE"; result: TailoredOutput }
  | { status: "FAILED"; errorMessage: string };

// The display order of pipeline steps
const STEPS: { status: JobStatus; label: string; description: string }[] = [
  {
    status: "PENDING",
    label: "Submitted",
    description: "Your inputs have been received.",
  },
  {
    status: "DRAFTING",
    label: "Drafting CV & Cover Letter",
    description: "Claude 3.7 Sonnet is tailoring your application.",
  },
  {
    status: "CRITIQUE",
    label: "Analysing Your Fit",
    description: "Claude Haiku is scoring your application and identifying gaps.",
  },
  {
    status: "COMPLETE",
    label: "Ready",
    description: "Your tailored application is ready.",
  },
];

// Maps a status value to a 0-based step index so we can show completed/active/pending
function statusToIndex(status: JobStatus): number {
  const map: Record<JobStatus, number> = {
    PENDING: 0,
    DRAFTING: 1,
    CRITIQUE: 2,
    COMPLETE: 3,
    FAILED: -1,
  };
  return map[status] ?? -1;
}

// ── Score Ring component ───────────────────────────────────────────────────

function ScoreRing({
  score,
  label,
  color,
}: {
  score: number;
  label: string;
  color: "violet" | "emerald";
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const strokeColor = color === "violet" ? "#7c3aed" : "#10b981";

  return (
    <div
      className="flex flex-col items-center gap-1"
      role="img"
      aria-label={`${label}: ${score} out of 100`}
    >
      <div className="relative h-28 w-28">
        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100" aria-hidden>
          {/* Track */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/30"
          />
          {/* Fill */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{score}</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

// ── Priority badge ─────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  HIGH: {
    label: "HIGH",
    className: "bg-red-500/15 text-red-400 border-red-500/20",
    dot: "bg-red-500",
  },
  MEDIUM: {
    label: "MEDIUM",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
  },
  LOW: {
    label: "LOW",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
} as const;

function PriorityBadge({ priority }: { priority: GapAdvice["priority"] }) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${config.className}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden />
      {config.label}
    </span>
  );
}

// ── Download helper ────────────────────────────────────────────────────────

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function JobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId as string;

  const [status, setStatus] = useState<JobStatus>("PENDING");
  const [result, setResult] = useState<TailoredOutput | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.onmessage = (event) => {
      let payload: SSEPayload;
      try {
        payload = JSON.parse(event.data as string) as SSEPayload;
      } catch {
        return;
      }

      setStatus(payload.status);

      if (payload.status === "COMPLETE") {
        setResult(payload.result);
        es.close();
        // Auto-scroll to results once
        if (!hasScrolled.current) {
          hasScrolled.current = true;
          setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 200);
        }
      }

      if (payload.status === "FAILED") {
        setErrorMessage(payload.errorMessage ?? "An unexpected error occurred.");
        es.close();
      }
    };

    es.onerror = () => {
      setStatus("FAILED");
      setErrorMessage("Lost connection to the server. Please try again.");
      es.close();
    };

    return () => es.close();
  }, [jobId]);

  const currentIndex = statusToIndex(status);
  const isFailed = status === "FAILED";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 space-y-12">
      {/* Background blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <button
          onClick={() => router.push("/")}
          className="text-base text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-6 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          ← New application
        </button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isFailed ? "Something went wrong" : "Tailoring your application…"}
        </h1>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {isFailed
            ? `Error: ${errorMessage}`
            : `Current step: ${STEPS[Math.max(0, currentIndex)]?.label ?? status}`}
        </p>
        <p className="text-sm text-muted-foreground font-mono">
          Job ID: {jobId}
        </p>
      </div>

      {/* ── Failed state ───────────────────────────────────────────── */}
      {isFailed && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground">
              {errorMessage ||
                "We weren't able to complete your application. This is usually a temporary issue."}
            </p>
            <Button
              onClick={() => router.push("/")}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Progress steps ─────────────────────────────────────────── */}
      {!isFailed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4" aria-label="Pipeline progress">
              {STEPS.map((step, i) => {
                const isDone = i < currentIndex;
                const isActive = i === currentIndex;
                const isPending = i > currentIndex;

                return (
                  <li key={step.status} className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center">
                      {isDone ? (
                        <svg
                          className="h-5 w-5 text-emerald-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-label="Complete"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : isActive ? (
                        <svg
                          className="h-5 w-5 animate-spin text-violet-400"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-label="In progress"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                          />
                        </svg>
                      ) : (
                        <span
                          className="h-2 w-2 rounded-full bg-muted-foreground/30"
                          aria-label="Pending"
                        />
                      )}
                    </div>
                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-base font-medium ${
                          isDone
                            ? "text-emerald-400"
                            : isActive
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {step.label}
                      </p>
                      {isActive && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {step.description}
                        </p>
                      )}
                    </div>
                    {/* Active badge */}
                    {isActive && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-violet-500/40 text-violet-400 text-sm"
                      >
                        {isPending ? "Waiting" : "Running"}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      {result && (
        <div ref={resultsRef} className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Your Results</h2>
            <p className="text-base text-muted-foreground mt-1">
              All four artefacts generated in one run · {new Date(result.completedAt).toLocaleTimeString()}
            </p>
          </div>

          {/* ── A: Tailored CV ──────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle>Tailored CV</CardTitle>
                <CardDescription>
                  Rewritten to lead with experience most relevant to this role.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={() => downloadMarkdown(result.tailoredCV, "tailored-cv.md")}
                className="shrink-0"
                aria-label="Download tailored CV as Markdown"
              >
                Download .md
              </Button>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6">
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.tailoredCV}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>

          {/* ── B: Cover Letter ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle>Cover Letter</CardTitle>
                <CardDescription>
                  Written specifically for this role and company.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={() => downloadMarkdown(result.coverLetter, "cover-letter.md")}
                className="shrink-0"
                aria-label="Download cover letter as Markdown"
              >
                Download .md
              </Button>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6">
              <div className="prose prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.coverLetter}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>

          {/* ── C: Scorecard ────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Application Scorecard</CardTitle>
              <CardDescription>
                How well your tailored application aligns to the role, and an honest
                assessment of your likelihood of progressing.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6 space-y-6">
              {/* Score rings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center gap-4 rounded-lg border border-border/60 bg-card p-6">
                  <ScoreRing
                    score={result.fitScore}
                    label="CV Fit Score"
                    color="violet"
                  />
                  <p className="text-center text-base text-muted-foreground">
                    {result.fitRationale}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-4 rounded-lg border border-border/60 bg-card p-6">
                  <ScoreRing
                    score={result.likelihoodScore}
                    label="Likelihood of Hire"
                    color="emerald"
                  />
                  <p className="text-center text-base text-muted-foreground">
                    {result.likelihoodRationale}
                  </p>
                </div>
              </div>

              {/* Critique notes */}
              {result.critiqueNotes && (
                <div className="rounded-lg bg-muted/40 p-4 text-base text-muted-foreground border border-border/40">
                  <p className="text-sm font-semibold uppercase tracking-wide text-foreground/60 mb-2">
                    CV Critique
                  </p>
                  {result.critiqueNotes}
                </div>
              )}

              {/* Suggested improvements */}
              {result.suggestedImprovements.length > 0 && (
                <div>
                  <p className="text-base font-semibold mb-3">Quick Wins</p>
                  <ul className="space-y-2">
                    {result.suggestedImprovements.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-base text-muted-foreground">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── D: Gap Analysis ─────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Gap Analysis</CardTitle>
              <CardDescription>
                {result.gapAnalysis.length === 0
                  ? "No significant gaps found — your experience closely matches this role."
                  : `${result.gapAnalysis.length} area${result.gapAnalysis.length !== 1 ? "s" : ""} to address, ordered by priority.`}
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-6">
              {result.gapAnalysis.length === 0 ? (
                <p className="text-base text-emerald-400 font-medium">
                  ✓ Your background is a strong match. No critical gaps identified.
                </p>
              ) : (
                <ol className="space-y-6">
                  {result.gapAnalysis.map((gap, i) => (
                    <li key={i} className="space-y-2">
                      <div className="flex items-start gap-3">
                        <PriorityBadge priority={gap.priority} />
                        <p className="text-base font-semibold leading-snug">{gap.gap}</p>
                      </div>
                      <p className="text-base text-muted-foreground leading-relaxed pl-0">
                        {gap.advice}
                      </p>
                      {i < result.gapAnalysis.length - 1 && (
                        <Separator className="mt-4" />
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* ── Footer CTA ──────────────────────────────────────────── */}
          <div className="text-center pb-8">
            <Button
              onClick={() => router.push("/")}
              size="lg"
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              Tailor Another Application →
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
