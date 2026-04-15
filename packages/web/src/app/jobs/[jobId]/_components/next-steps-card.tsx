import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { GapAdvice } from "@/lib/types";

export function NextStepsCard({ gapAnalysis }: { gapAnalysis: GapAdvice[] }) {
  const highGaps = gapAnalysis.filter((g) => g.priority === "HIGH");
  const actions = (
    highGaps.length > 0 ? highGaps : gapAnalysis.filter((g) => g.priority === "MEDIUM")
  ).slice(0, 3);

  if (actions.length === 0) return null;

  return (
    <Card className="border-violet-500/30 bg-violet-500/5">
      <CardHeader className="pb-3">
        <CardTitle>Your Next Steps</CardTitle>
        <CardDescription>
          The highest-impact actions to strengthen this application.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="pt-5">
        <ol className="space-y-4">
          {actions.map((gap, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-300">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{gap.gap}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{gap.advice}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
