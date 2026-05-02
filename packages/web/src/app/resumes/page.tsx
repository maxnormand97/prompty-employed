import Link from "next/link";
import { ResumeLibraryClient } from "./resume-library-client";

export default function ResumesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 space-y-8">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-300">
            Resume library
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Manage your resumes</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Store multiple resume versions locally, replace uploads, and pick the one you want to use before tailoring an application.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to application
        </Link>
      </div>

      <ResumeLibraryClient />
    </main>
  );
}
