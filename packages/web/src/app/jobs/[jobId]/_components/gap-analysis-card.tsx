import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { GapAdvice } from "@/lib/types";
import { PriorityBadge } from "./priority-badge";

const MISSING_PATTERN = /missing|absent|no experience|not mentioned/i;

function getGapType(advice: string): "Missing" | "Undersold" {
  return MISSING_PATTERN.test(advice) ? "Missing" : "Undersold";
}

function buildDescription(count: number, isNoFit: boolean): string {
  if (count === 0) {
    return isNoFit
      ? "No detailed gap breakdown available."
      : "No significant gaps found — your experience closely matches this role.";
  }
  return isNoFit
    ? `${count} gap${count !== 1 ? "s" : ""} to close before applying to similar roles.`
    : `${count} area${count !== 1 ? "s" : ""} to address, ordered by priority.`;
}

export function GapAnalysisCard({
  gapAnalysis,
  isNoFit,
}: {
  gapAnalysis: GapAdvice[];
  isNoFit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gap Analysis</CardTitle>
        <CardDescription>{buildDescription(gapAnalysis.length, isNoFit)}</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6">
        {gapAnalysis.length === 0 ? (
          <p className="text-base text-emerald-400 font-medium">
            ✓ Your background is a strong match. No critical gaps identified.
          </p>
        ) : (
          <ol className="space-y-6">
            {gapAnalysis.map((gap, i) => (
              <li key={`${gap.priority}-${gap.gap}`} className="space-y-2">
                <div className="flex items-start gap-3">
                  <PriorityBadge priority={gap.priority} />
                  <p className="text-base font-semibold leading-snug">{gap.gap}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {getGapType(gap.advice) === "Missing" ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-red-400">
                      <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
                      Missing from resume
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm text-amber-400">
                      <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                      Undersold in resume
                    </span>
                  )}
                </div>
                <p className="text-base text-muted-foreground leading-relaxed">{gap.advice}</p>
                {i < gapAnalysis.length - 1 && <Separator className="mt-4" />}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
