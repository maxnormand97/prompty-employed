import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ClearAllButton } from "./_components/clear-all-button";
import { RunCard } from "./_components/run-card";

export default async function DevRunsPage() {
  if (process.env.NODE_ENV !== "development") {
    redirect("/");
  }

  const { listRuns } = await import("@/lib/server/dev-db");
  const runs = listRuns();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 space-y-8">
      {/* Background blob */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-violet-300 mb-1">
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5">
              DEV
            </span>
            Local run history
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Previous Runs</h1>
          <p className="text-sm text-muted-foreground">
            {runs.length} run{runs.length !== 1 ? "s" : ""} stored locally in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">dev-data/results.db</code>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← New application
          </Link>
          {runs.length > 0 && <ClearAllButton />}
        </div>
      </div>

      <Separator className="bg-border/50" />

      {runs.length === 0 ? (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            No runs yet. Submit a job application to see results here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard key={run.job_id} run={run} />
          ))}
        </div>
      )}
    </main>
  );
}
