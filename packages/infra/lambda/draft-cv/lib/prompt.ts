/**
 * Prompts for the draft-cv lambda.
 *
 * User-supplied text is wrapped in XML delimiter tags as recommended by Anthropic
 * to separate instructions from untrusted content (prompt injection mitigation).
 */

/**
 * System prompt for the main draft Bedrock call.
 * Sent as the top-level "system" field — treated with higher authority than the user turn.
 */
export const DRAFT_SYSTEM_PROMPT = `You are an expert CV writer.
ABSOLUTE HARD RULE — WORK HISTORY LOCK:
The ONLY employers, job titles, and employment dates you may include in the tailored CV
are those present verbatim in the candidate's <resume>. The company the candidate is
APPLYING TO is NOT an employer in their work history. Listing the target company as a
current or previous employer is a critical, disqualifying error that renders the output
unusable. This rule overrides every other instruction.`;

/**
 * Build the fit pre-screening prompt for a cheap Haiku call.
 * Returns JSON: {"verdict": "YES" | "NO", "reason": "<one sentence>"}
 */
export function buildScreenPrompt(resume: string, jobDescription: string): string {
  return `You are a senior recruiter screening candidates.

Given the resume and job description below, answer one question:
Does this candidate have any reasonable basis to apply for this role?

Respond with ONLY a JSON object — no preamble, no markdown fences:
{"verdict": "YES" | "NO", "reason": "<one sentence explaining the decision>"}

<resume>
${resume}
</resume>

<job_description>
${jobDescription}
</job_description>`;
}

/**
 * Build the prompt for Claude to draft a tailored CV and cover letter.
 *
 * User-supplied text is wrapped in XML delimiter tags as recommended by Anthropic
 * to separate instructions from untrusted content (prompt injection mitigation).
 */
export function buildDraftPrompt(
  resume: string,
  jobDescription: string,
  companyInfo?: string
): string {
  const companySection = companyInfo
    ? `\n<company_info>\n${companyInfo}\n</company_info>\n`
    : "";

  const companyInstruction = companyInfo
    ? `   - Use the company information provided to make the cover letter specific to the
     organisation — reference their values, products, or mission where genuinely
     relevant to the candidate's experience.`
    : "";

  return `Your task is to produce TWO artefacts for the candidate below.

STEP 1 — ANALYSIS (do this internally before writing anything):
a. List every technology, skill, and requirement mentioned in the job description.
b. For each item, check whether it appears in the candidate's resume.
c. Build a clear mental map of what aligns, what is transferable, and what is absent.

STEP 1.5 — WORK HISTORY LOCK (do this internally — do NOT output this list):
List every employer name and job title from the resume exactly as written.
This is the complete, immutable set of work experience you are permitted to reference.
Adding any other employer — including the company being applied to — is a critical error.

STEP 2 — TAILORED CV
Rewrite the candidate's resume so it is closely aligned to the target job description,
guided strictly by your Step 1 and Step 1.5 analysis.

   STRICT RULES — you MUST follow every rule below without exception:
   - Only use information that is explicitly present in the candidate's original resume.
   - Do NOT invent, fabricate, or exaggerate any experience, skills, qualifications,
     technologies, or achievements that are not in the original resume.
   - Do NOT add the job title being applied for as if it were a previous or current
     work experience of the candidate.
   - Do NOT include the target company as a current or past employer under any
     circumstances — the candidate is applying there, not working there.
   - If a required skill is absent from the resume, do NOT claim the candidate has it.
     Highlight genuinely related or transferable experience where it exists instead.
   - You may reorder, reframe, and emphasise existing content to best match the role,
     but every factual claim must trace back to the original resume.
   - Preserve the candidate's actual job titles, employer names, and dates exactly.

   Output the full tailored CV in clean Markdown.

STEP 3 — COVER LETTER
Write a compelling, specific cover letter for this role.
   - Reference only concrete achievements and experience present in the resume.
   - Apply the same strict fabrication rules as above.
   - Be honest about the candidate's fit for the role. If the match is partial or the
     candidate lacks key requirements, acknowledge this plainly rather than constructing
     an optimistic narrative that overstates their qualifications.
   - Do NOT imply the candidate already works at the target company.
${companyInstruction}
   Output the cover letter in clean Markdown.

Separate the two artefacts with the exact delimiter line:
---COVER_LETTER_START---

<resume>
${resume}
</resume>

<job_description>
${jobDescription}
</job_description>
${companySection}
Respond with only the two Markdown artefacts separated by the delimiter. No preamble.`;
}
