import { redirect } from "next/navigation";
import Link from "next/link";
import { listRuns } from "@/lib/server/dev-db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ClearRunsButton } from "./_components/clear-runs-button";

export default function DevRunsPage() {
  if (process.env.NODE_ENV !== "development") {
    redirect("/");
  }

  const runs = listRuns();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 space-y-8">
      {/* Background blob */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Home
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-2 py-0.5">
              dev only
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Previous Runs</h1>
          <p className="text-sm text-muted-foreground">
            {runs.length === 0
              ? "No runs recorded yet."
              : `${runs.length} run${runs.length === 1 ? "" : "s"} stored in local SQLite.`}
          </p>
        </div>

        {runs.length > 0 && <ClearRunsButton />}
      </div>

      <Separator className="bg-border/50" />

      {/* Runs list */}
      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Submit an application on the homepage to see runs here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.job_id} size="sm">
              <CardHeader className="py-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-mono truncate">
                        <Link
                          href={`/jobs/${run.job_id}`}
                          className="hover:text-violet-400 transition-colors"
                        >
                          {run.job_id}
                        </Link>
                      </CardTitle>

                      {run.fit_verdict ? (
                        <Badge
                          variant={run.fit_verdict === "FIT" ? "default" : "destructive"}
                          className={
                            run.fit_verdict === "FIT"
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : undefined
                          }
                        >
                          {run.fit_verdict === "FIT" ? "FIT" : "NO FIT"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          pending
                        </Badge>
                      )}

                      {run.fit_score != null && (
                        <span className="text-xs text-muted-foreground">
                          score: <span className="text-foreground font-medium">{run.fit_score}</span>
                          /100
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Submitted:{" "}
                      <time dateTime={run.submitted_at}>
                        {new Date(run.submitted_at).toLocaleString()}
                      </time>
                      {run.completed_at && (
                        <>
                          {" · "}Completed:{" "}
                          <time dateTime={run.completed_at}>
                            {new Date(run.completed_at).toLocaleString()}
                          </time>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
