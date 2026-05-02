"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { JobSubmissionSchema } from "@/lib/types";
import { FormField } from "@/app/_components/form-field";
import { ResumePickerCard } from "@/app/_components/resume-picker-card";
import { getSelectedResumeId, listStoredResumes, markResumeUsed } from "@/lib/resume-library";

const RESUME_MIN = 200;
const RESUME_MAX = 15000;
const JD_MIN = 50;
const JD_MAX = 15000;
const COMPANY_MAX = 5000;

interface FieldErrors {
  masterResume?: string;
  jobDescription?: string;
  companyInfo?: string;
  form?: string;
}

export default function HomePage() {
  const router = useRouter();

  const [masterResume, setMasterResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [companyInfo, setCompanyInfo] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [resubmitBanner, setResubmitBanner] = useState(false);

  // Pre-fill form when navigated here via the "Resubmit" quick action on the
  // runs list. The run card stores {jobId} in sessionStorage under 'resubmit-data'.
  useEffect(() => {
    const raw = sessionStorage.getItem("resubmit-data");
    if (!raw) return;
    sessionStorage.removeItem("resubmit-data");
    let jobId: string | undefined;
    try {
      ({ jobId } = JSON.parse(raw) as { jobId?: string });
    } catch {
      return;
    }
    if (!jobId) return;

    fetch(`/api/dev/runs/${jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((detail: { resume_text?: string | null; jd_text?: string | null; company_info?: string | null } | null) => {
        if (!detail) return;
        if (detail.resume_text) setMasterResume(detail.resume_text);
        if (detail.jd_text) setJobDescription(detail.jd_text);
        if (detail.company_info) setCompanyInfo(detail.company_info);
        setResubmitBanner(true);
      })
      .catch(() => { /* best-effort */ });
  }, []);

  function validate(): FieldErrors {
    const result = JobSubmissionSchema.safeParse({ masterResume, jobDescription, companyInfo: companyInfo || undefined });
    if (result.success) return {};

    const errs: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof FieldErrors;
      if (field === "masterResume" || field === "jobDescription" || field === "companyInfo") {
        errs[field] = issue.message;
      }
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const selectedResumeId = getSelectedResumeId();
      const selectedResume = selectedResumeId
        ? listStoredResumes().find((resume) => resume.id === selectedResumeId) ?? null
        : null;

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterResume,
          ...(selectedResume
            ? {
                selectedResumeId: selectedResume.id,
                resumeName: selectedResume.name,
                resumeSource: selectedResume.source,
                ...(selectedResume.fileType ? { resumeFileType: selectedResume.fileType } : {}),
                ...(selectedResume.mimeType ? { resumeMimeType: selectedResume.mimeType } : {}),
              }
            : {}),
          jobDescription,
          ...(companyInfo ? { companyInfo } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors({
          form:
            (data as { error?: string }).error ?? "Submission failed. Please try again.",
        });
        return;
      }

      const { jobId } = (await res.json()) as { jobId: string };
      localStorage.setItem(`jd-${jobId}`, jobDescription);
      if (selectedResumeId) {
        markResumeUsed(selectedResumeId);
      }

      // Fire-and-forget: persist inputs to local SQLite for dev review.
      // Only runs in development — no blocking of navigation.
      if (process.env.NODE_ENV === "development") {
        fetch("/api/dev/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            submittedAt: new Date().toISOString(),
            resumeText: masterResume,
            jdText: jobDescription,
            companyInfo: companyInfo || null,
          }),
        }).catch(() => { /* best-effort, ignore errors */ });
      }

      router.push(`/jobs/${jobId}`);
    } catch {
      setErrors({ form: "Could not reach the server. Please check your connection." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {/* Background gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[600px] rounded-full bg-indigo-600/8 blur-3xl" />
      </div>

      <div className="w-full max-w-2xl space-y-10">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Link href="/resumes" className="hover:text-foreground transition-colors">
              Manage resumes
            </Link>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 mb-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
            </span>
            AI-powered · Under 60 seconds
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Promptly Employed
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Paste your resume and a job description. Get a tailored CV, cover
            letter, and an honest assessment of your chances — instantly.
          </p>
        </div>

        {/* ── Form ──────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* Resubmit banner */}
          {resubmitBanner && (
            <Alert className="border-violet-500/30 bg-violet-500/10 text-violet-200">
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>Previous run inputs pre-filled. Edit as needed before resubmitting.</span>
                <button
                  type="button"
                  onClick={() => setResubmitBanner(false)}
                  className="text-xs opacity-60 hover:opacity-100 transition-opacity shrink-0"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </AlertDescription>
            </Alert>
          )}
          <ResumePickerCard onResumeTextChange={setMasterResume} />

          <FormField
            id="masterResume"
            label="Your Master Resume / Experience List"
            value={masterResume}
            onChange={setMasterResume}
            onClearError={() => setErrors((p) => ({ ...p, masterResume: undefined }))}
            placeholder="Paste your full work history, skills, and achievements — all roles, not just the most recent. The more detail, the better the tailoring."
            rows={10}
            max={RESUME_MAX}
            minForGreen={RESUME_MIN}
            error={errors.masterResume}
            errorId="resume-error"
            disabled={submitting}
          />

          <FormField
            id="jobDescription"
            label="Job Description"
            value={jobDescription}
            onChange={setJobDescription}
            onClearError={() => setErrors((p) => ({ ...p, jobDescription: undefined }))}
            placeholder="Paste the full job description from Seek, LinkedIn, or the company careers page — including responsibilities, requirements, and any 'nice to haves'."
            rows={8}
            max={JD_MAX}
            minForGreen={JD_MIN}
            error={errors.jobDescription}
            errorId="jd-error"
            disabled={submitting}
          />

          <FormField
            id="companyInfo"
            label="Company Information"
            optional
            value={companyInfo}
            onChange={setCompanyInfo}
            onClearError={() => setErrors((p) => ({ ...p, companyInfo: undefined }))}
            placeholder="Add anything you know about the company — their mission, recent news, tech stack, culture, or why you want to work there. This helps personalise the cover letter and brief."
            rows={5}
            max={COMPANY_MAX}
            error={errors.companyInfo}
            errorId="company-error"
            disabled={submitting}
          />

          {/* Form-level error */}
          {errors.form && (
            <Alert variant="destructive">
              <AlertDescription>{errors.form}</AlertDescription>
            </Alert>
          )}

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold text-base h-12 transition-colors"
            disabled={submitting}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
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
                Submitting…
              </span>
            ) : (
              "Tailor My Application →"
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Your data is processed securely and deleted after 30 days. No account required.
          </p>
        </form>

        {/* Dev-only link — not rendered in production builds */}
        {process.env.NODE_ENV === "development" && (
          <p className="text-center text-xs text-muted-foreground/60">
            <a href="/dev/runs" className="hover:text-muted-foreground underline underline-offset-4 transition-colors">
              View previous runs →
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
