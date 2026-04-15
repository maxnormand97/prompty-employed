import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { scoreBand } from "@/lib/scores";
import type { TailoredOutput } from "@/lib/types";
import { ScoreRing } from "./score-ring";

const POSITIVE_WORDS =
  /strong|clear|good|solid|relevant|aligns|demonstrates|shows|highlights/i;

export function ScorecardCard({
  result,
  isNoFit,
}: {
  result: TailoredOutput;
  isNoFit: boolean;
}) {
  const strengths = result.suggestedImprovements.filter((tip) => POSITIVE_WORDS.test(tip));
  const quickWins = result.suggestedImprovements.filter((tip) => !POSITIVE_WORDS.test(tip));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNoFit ? "Screening Scorecard" : "Application Scorecard"}</CardTitle>
        <CardDescription>
          {isNoFit
            ? "Why this application did not pass the minimum requirements threshold."
            : "How well your tailored application aligns to the role, and an honest assessment of your likelihood of progressing."}
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6 space-y-6">
        {/* Score rings */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border/60 bg-card p-6">
            <ScoreRing score={result.fitScore} label="CV Fit Score" color="violet" />
            <span className={`text-sm font-semibold ${scoreBand(result.fitScore).className}`}>
              {scoreBand(result.fitScore).label}
            </span>
            <p className="text-center text-base text-muted-foreground">{result.fitRationale}</p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border/60 bg-card p-6">
            <ScoreRing score={result.likelihoodScore} label="Likelihood of Hire" color="emerald" />
            <span
              className={`text-sm font-semibold ${scoreBand(result.likelihoodScore).className}`}
            >
              {scoreBand(result.likelihoodScore).label}
            </span>
            <p className="text-center text-base text-muted-foreground">
              {result.likelihoodRationale}
            </p>
          </div>
        </div>

        {/* Critique notes */}
        {result.critiqueNotes && (
          <div className="rounded-lg bg-muted/40 p-4 text-base text-muted-foreground border border-border/40">
            <p className="text-sm font-semibold uppercase tracking-wide text-foreground/60 mb-2">
              {isNoFit ? "Screening Notes" : "CV Critique"}
            </p>
            {result.critiqueNotes}
          </div>
        )}

        {/* Suggested improvements — hidden on NO_FIT */}
        {!isNoFit && result.suggestedImprovements.length > 0 && (
          <>
            {strengths.length > 0 && (
              <div>
                <p className="text-base font-semibold mb-3">What&apos;s working</p>
                <ul className="space-y-2">
                  {strengths.map((tip, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-base text-muted-foreground"
                    >
                      <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden>
                        ✓
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {quickWins.length > 0 && (
              <div>
                <p className="text-base font-semibold mb-3">Quick Wins</p>
                <ul className="space-y-2">
                  {quickWins.map((tip, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-base text-muted-foreground"
                    >
                      <span
                        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400"
                        aria-hidden
                      />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
