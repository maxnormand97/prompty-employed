"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { JobSubmissionSchema } from "@/lib/types";

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
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterResume, jobDescription, ...(companyInfo ? { companyInfo } : {}) }),
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
      router.push(`/jobs/${jobId}`);
    } catch {
      setErrors({ form: "Could not reach the server. Please check your connection." });
    } finally {
      setSubmitting(false);
    }
  }

  const resumeCount = masterResume.length;
  const jdCount = jobDescription.length;
  const companyCount = companyInfo.length;

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
          {/* Master Resume */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="masterResume"
                className="text-sm font-medium text-foreground"
              >
                Your Master Resume / Experience List
              </label>
              <span
                className={`text-sm tabular-nums ${
                  resumeCount > RESUME_MAX
                    ? "text-destructive"
                    : resumeCount >= RESUME_MIN
                    ? "text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {resumeCount.toLocaleString()} / {RESUME_MAX.toLocaleString()}
              </span>
            </div>
            <Textarea
              id="masterResume"
              name="masterResume"
              placeholder="Paste your full work history, skills, and achievements — all roles, not just the most recent. The more detail, the better the tailoring."
              value={masterResume}
              onChange={(e) => {
                setMasterResume(e.target.value);
                if (errors.masterResume)
                  setErrors((p) => ({ ...p, masterResume: undefined }));
              }}
              rows={10}
              className="resize-y font-mono text-base leading-relaxed"
              aria-describedby={errors.masterResume ? "resume-error" : undefined}
              aria-invalid={!!errors.masterResume}
              disabled={submitting}
            />
            {errors.masterResume && (
              <p id="resume-error" className="text-base text-destructive" role="alert">
                {errors.masterResume}
              </p>
            )}
          </div>

          {/* Job Description */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="jobDescription"
                className="text-sm font-medium text-foreground"
              >
                Job Description
              </label>
              <span
                className={`text-sm tabular-nums ${
                  jdCount > JD_MAX
                    ? "text-destructive"
                    : jdCount >= JD_MIN
                    ? "text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {jdCount.toLocaleString()} / {JD_MAX.toLocaleString()}
              </span>
            </div>
            <Textarea
              id="jobDescription"
              name="jobDescription"
              placeholder="Paste the full job description from Seek, LinkedIn, or the company careers page — including responsibilities, requirements, and any 'nice to haves'."
              value={jobDescription}
              onChange={(e) => {
                setJobDescription(e.target.value);
                if (errors.jobDescription)
                  setErrors((p) => ({ ...p, jobDescription: undefined }));
              }}
              rows={8}
              className="resize-y font-mono text-base leading-relaxed"
              aria-describedby={errors.jobDescription ? "jd-error" : undefined}
              aria-invalid={!!errors.jobDescription}
              disabled={submitting}
            />
            {errors.jobDescription && (
              <p id="jd-error" className="text-base text-destructive" role="alert">
                {errors.jobDescription}
              </p>
            )}
          </div>

          {/* Company Information (optional) */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="companyInfo"
                className="text-sm font-medium text-foreground"
              >
                Company Information
                <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
              </label>
              <span
                className={`text-sm tabular-nums ${
                  companyCount > COMPANY_MAX
                    ? "text-destructive"
                    : companyCount > 0
                    ? "text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {companyCount.toLocaleString()} / {COMPANY_MAX.toLocaleString()}
              </span>
            </div>
            <Textarea
              id="companyInfo"
              name="companyInfo"
              placeholder="Add anything you know about the company — their mission, recent news, tech stack, culture, or why you want to work there. This helps personalise the cover letter and brief."
              value={companyInfo}
              onChange={(e) => {
                setCompanyInfo(e.target.value);
                if (errors.companyInfo)
                  setErrors((p) => ({ ...p, companyInfo: undefined }));
              }}
              rows={5}
              className="resize-y font-mono text-base leading-relaxed"
              aria-describedby={errors.companyInfo ? "company-error" : undefined}
              aria-invalid={!!errors.companyInfo}
              disabled={submitting}
            />
            {errors.companyInfo && (
              <p id="company-error" className="text-base text-destructive" role="alert">
                {errors.companyInfo}
              </p>
            )}
          </div>

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
      </div>
    </main>
  );
}
