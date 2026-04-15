"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useJobStream } from "@/hooks/use-job-stream";
import { AtsKeywordCard } from "./_components/ats-keyword-card";
import { CompanyBriefCard } from "./_components/company-brief-card";
import { CoverLetterCard } from "./_components/cover-letter-card";
import { GapAnalysisCard } from "./_components/gap-analysis-card";
import { NextStepsCard } from "./_components/next-steps-card";
import { NoFitBanner } from "./_components/no-fit-banner";
import { PipelineStatus } from "./_components/pipeline-status";
import { ResumeDraftCard } from "./_components/resume-draft-card";
import { ScorecardCard } from "./_components/scorecard-card";


export default function JobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId as string;

  const { status, result, errorMessage, jdText, resultsRef } = useJobStream(jobId);

  const isNoFit = result?.fitVerdict === "NO_FIT";
  const isFailed = status === "FAILED";
  const [now] = useState(() => Date.now());
  const daysSince = result
    ? Math.floor((now - new Date(result.completedAt).getTime()) / 86_400_000)
    : 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 space-y-12">
      {/* Background blob */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      {/* Header */}
      <div className="space-y-1">
        <button
          onClick={() => router.push("/")}
          className="text-base text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-6 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          ← New application
        </button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isFailed
            ? "Something went wrong"
            : isNoFit
            ? "Application not competitive"
            : status === "COMPLETE"
            ? "Your application is ready"
            : "Tailoring your application…"}
        </h1>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {isFailed ? `Error: ${errorMessage}` : `Status: ${status}`}
        </p>
        <p className="text-sm text-muted-foreground font-mono">Job ID: {jobId}</p>
      </div>

      {/* Failed state */}
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

      {/* Pipeline progress */}
      {!isFailed && <PipelineStatus status={status} isNoFit={isNoFit} />}

      {/* Results */}
      {result && (
        <div ref={resultsRef} className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {isNoFit ? "Screening Result" : "Your Results"}
            </h2>
            <p className="text-base text-muted-foreground mt-1">
              {isNoFit
                ? `Assessed ${new Date(result.completedAt).toLocaleTimeString()}`
                : `All four artefacts generated in one run · ${new Date(result.completedAt).toLocaleTimeString()}`}
            </p>
          </div>

          {daysSince >= 1 && (
            <div
              className={`rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2 ${
                daysSince > 7
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-border/40 bg-muted/30 text-muted-foreground"
              }`}
            >
              <span aria-hidden>🕐</span>
              {daysSince === 1
                ? "Assessed 1 day ago — job postings change, consider re-analysing."
                : `Assessed ${daysSince} days ago — job postings change, consider re-analysing.`}
            </div>
          )}

          {isNoFit && <NoFitBanner fitReason={result.fitReason} />}

          {result.companySummary && (
            <CompanyBriefCard companySummary={result.companySummary} />
          )}

          {!isNoFit && jdText && (
            <AtsKeywordCard jdText={jdText} tailoredCV={result.tailoredCV} />
          )}

          {!isNoFit && result.tailoredCV && (
            <ResumeDraftCard tailoredCV={result.tailoredCV} />
          )}

          {!isNoFit && result.coverLetter && (
            <CoverLetterCard coverLetter={result.coverLetter} />
          )}

          <ScorecardCard result={result} isNoFit={isNoFit} />

          <GapAnalysisCard gapAnalysis={result.gapAnalysis} isNoFit={isNoFit} />

          <NextStepsCard gapAnalysis={result.gapAnalysis} />

          <div className="text-center pb-8">
            <Button
              onClick={() => router.push("/")}
              size="lg"
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {isNoFit ? "Try a Different Role →" : "Tailor Another Application →"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
