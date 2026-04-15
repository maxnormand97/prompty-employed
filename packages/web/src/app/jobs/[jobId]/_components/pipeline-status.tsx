import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobStatus } from "@/lib/types";

const FIT_STEPS: { status: JobStatus; label: string; description: string }[] = [
  { status: "PENDING", label: "Submitted", description: "Your inputs have been received." },
  { status: "DRAFTING", label: "Drafting CV & Cover Letter", description: "Claude is tailoring your application." },
  { status: "CRITIQUE", label: "Analysing Your Fit", description: "Scoring your application and identifying gaps." },
  { status: "COMPLETE", label: "Ready", description: "Your tailored application is ready." },
];

const NO_FIT_STEPS: { status: JobStatus; label: string; description: string }[] = [
  { status: "PENDING", label: "Submitted", description: "Your inputs have been received." },
  { status: "DRAFTING", label: "Screening", description: "Checking your application against the role requirements." },
  { status: "COMPLETE", label: "Screening Complete", description: "Screening complete." },
];

function statusToActiveIndex(status: JobStatus, isNoFit: boolean): number {
  if (isNoFit) {
    return (
      { PENDING: 0, DRAFTING: 1, CRITIQUE: 1, COMPLETE: NO_FIT_STEPS.length, FAILED: -1 }[
        status
      ] ?? -1
    );
  }
  return (
    { PENDING: 0, DRAFTING: 1, CRITIQUE: 2, COMPLETE: FIT_STEPS.length, FAILED: -1 }[status] ?? -1
  );
}

export function PipelineStatus({
  status,
  isNoFit,
}: {
  status: JobStatus;
  isNoFit: boolean;
}) {
  const steps = isNoFit ? NO_FIT_STEPS : FIT_STEPS;
  const activeIndex = statusToActiveIndex(status, isNoFit);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline Status</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4" aria-label="Pipeline progress">
          {steps.map((step, i) => {
            const isDone = i < activeIndex;
            const isActive = i === activeIndex;
            return (
              <li key={step.status} className="flex items-start gap-4">
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
                    <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
                  )}
                </div>
                {isActive && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-violet-500/40 text-violet-400 text-sm"
                  >
                    Running
                  </Badge>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
