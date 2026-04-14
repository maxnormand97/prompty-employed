/**
 * Build the critique prompt for Claude.
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

  const companySummaryField = `  "companySummary": "<2–3 sentence note on what the hiring team is prioritising and what the candidate must demonstrate to progress>",`;

  const companyInstruction = companyInfo
    ? `- Use the company information to assess culture fit and inform the companySummary field.`
    : `- Base the companySummary on the job description alone — summarise the role's key priorities and what the hiring team is screening for.`;

  return `You are a senior hiring manager reviewing a stack of 200 applications for a
competitive role. Your job is to filter ruthlessly and honestly — not to encourage.
You have no interest in being kind to weak applications. Your scores directly affect
whether a candidate invests more time in this application.

Analyse the CV and cover letter against the job description below.

SCORING DEFINITIONS — you MUST use these bands exactly:

fitScore — how well the CV's demonstrated experience maps to the stated requirements:
  0–15:  Little to no relevant experience; core domain entirely missing.
  16–35: Some peripheral overlap but fundamental domain or skill gaps.
  36–55: Partial match; relevant background exists but notable gaps remain.
  56–75: Good match; most requirements met with minor gaps.
  76–100: Strong match; experience closely mirrors requirements.

likelihoodScore — realistic chance of progressing to interview at a competitive employer:
  0–15:  Would not pass automated screening or initial CV review.
  16–35: Very unlikely to be shortlisted; only possible if the hiring pool is extremely thin.
  36–55: Outside bet — may get a look if the application volume is low.
  56–75: Competitive candidate; likely to be considered alongside others.
  76–100: Strong shortlist candidate.

HARD FLOOR RULES — these override everything else:
- If the job description requires N or more years of experience in a specific domain
  and the candidate's CV demonstrates fewer than N years in that domain, the
  likelihoodScore MUST NOT exceed 30.
- If the candidate holds only a bachelor's degree and the role explicitly requires a
  master's degree or higher, the likelihoodScore MUST NOT exceed 35.
- If the candidate has no demonstrable experience in the primary domain of the role
  (e.g. applying for a 3D artist role with no 3D art history on the CV), both
  fitScore and likelihoodScore MUST NOT exceed 20.
- A well-written CV does NOT compensate for missing experience. Score the underlying
  qualifications and experience, not the writing quality.

${companyInstruction}

Respond with ONLY a valid JSON object — no markdown fences, no preamble — matching
this exact schema:

{
  "critiqueNotes": "<honest qualitative assessment — call out missing experience, domain gaps, and any claims that appear exaggerated relative to the actual CV content>",
  "fitScore": <integer 0–100>,
  "fitRationale": "<one paragraph — be specific about what is present and what is absent>",
  "likelihoodScore": <integer 0–100>,
  "likelihoodRationale": "<one paragraph — state clearly which hard floor rule applies if a floor was triggered>",
  "suggestedImprovements": ["<actionable improvement 1>", "<actionable improvement 2>", ...],
  "gapAnalysis": [
    {
      "gap": "<specific experience or qualification gap>",
      "advice": "<concrete, actionable advice to close this gap>",
      "priority": "<HIGH | MEDIUM | LOW>"
    }
  ],
${companySummaryField}
}

Rules:
- fitScore and likelihoodScore MUST be whole integers between 0 and 100.
- Apply hard floor rules before outputting any score — they are not optional.
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
