/**
 * Build the critique prompt for Claude (Haiku).
 *
 * User-supplied text is wrapped in XML delimiter tags as recommended by Anthropic
 * to separate instructions from untrusted content (prompt injection mitigation).
 */
export function buildCritiquePrompt(
  tailoredCV: string,
  coverLetter: string,
  jobDescription: string,
  companyInfo?: string
): string {
  const companySection = companyInfo
    ? `\n<company_info>\n${companyInfo}\n</company_info>\n`
    : "";

  const companySummaryField = `  "companySummary": "<2–3 sentence coaching note: key things the candidate should keep in mind about the company and role when preparing for interviews or further communications>",`;

  const companyInstruction = companyInfo
    ? `- Use the company information to assess culture fit and inform the companySummary field.`
    : `- Base the companySummary on the job description alone — summarise the role's key priorities and what the hiring team is likely looking for.`;

  return `You are an expert recruiter and career coach.

Analyse the tailored CV and cover letter against the job description (and company
information, if provided) below.

Scoring rules:
- fitScore: how well the tailored CV's content and keywords align to the job description.
  Penalise heavily if the CV appears to claim skills or technologies not supported by
  the candidate's actual experience as evidenced in the CV narrative.
- likelihoodScore: realistic probability of progressing to interview, accounting for
  both strengths and gaps.
- Both scores MUST be whole integers between 0 and 100.

${companyInstruction}

Respond with ONLY a valid JSON object — no markdown fences, no preamble — matching
this exact schema:

{
  "critiqueNotes": "<qualitative feedback on the tailored CV — note any claims that seem exaggerated or inconsistent>",
  "fitScore": <integer 0–100>,
  "fitRationale": "<one paragraph explaining the fit score>",
  "likelihoodScore": <integer 0–100>,
  "likelihoodRationale": "<one paragraph explaining the likelihood score>",
  "suggestedImprovements": ["<quick win 1>", "<quick win 2>", ...],
  "gapAnalysis": [
    {
      "gap": "<experience or skill gap>",
      "advice": "<specific, actionable advice to close this gap>",
      "priority": "<HIGH | MEDIUM | LOW>"
    }
  ],
${companySummaryField}
}

Rules:
- fitScore and likelihoodScore MUST be whole integers between 0 and 100.
- Each gapAnalysis item MUST have non-empty "gap", "advice", and a "priority" of HIGH, MEDIUM, or LOW.
- companySummary MUST be a non-empty string.
- Output ONLY the JSON object. Any deviation will cause a pipeline failure.

<tailored_cv>
${tailoredCV}
</tailored_cv>

<cover_letter>
${coverLetter}
</cover_letter>

<job_description>
${jobDescription}
</job_description>
${companySection}`;
}
