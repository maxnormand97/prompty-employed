/**
 * Build the critique prompt for Claude (Haiku).
 *
 * User-supplied text is wrapped in XML delimiter tags as recommended by Anthropic
 * to separate instructions from untrusted content (prompt injection mitigation).
 */
export function buildCritiquePrompt(
  tailoredCV: string,
  coverLetter: string,
  jobDescription: string
): string {
  return `You are an expert recruiter and career coach.

Analyse the tailored CV and cover letter against the job description below.
Respond with ONLY a valid JSON object — no markdown fences, no preamble — matching this exact schema:

{
  "critiqueNotes": "<qualitative feedback on the tailored CV>",
  "fitScore": <integer 0–100, CV quality / keyword alignment>,
  "fitRationale": "<one paragraph explaining the fit score>",
  "likelihoodScore": <integer 0–100, probability of landing the role>,
  "likelihoodRationale": "<one paragraph explaining the likelihood score>",
  "suggestedImprovements": ["<quick win 1>", "<quick win 2>", ...],
  "gapAnalysis": [
    {
      "gap": "<experience or skill gap>",
      "advice": "<specific, actionable advice to close this gap>",
      "priority": "<HIGH | MEDIUM | LOW>"
    }
  ]
}

Rules:
- fitScore and likelihoodScore MUST be whole integers between 0 and 100.
- Each gapAnalysis item MUST have non-empty "gap", "advice", and a "priority" of HIGH, MEDIUM, or LOW.
- Output ONLY the JSON object. Any deviation will cause a pipeline failure.

<tailored_cv>
${tailoredCV}
</tailored_cv>

<cover_letter>
${coverLetter}
</cover_letter>

<job_description>
${jobDescription}
</job_description>`;
}
