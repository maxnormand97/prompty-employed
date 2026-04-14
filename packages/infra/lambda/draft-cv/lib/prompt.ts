/**
 * Build the prompt for Claude (Sonnet) to draft a tailored CV and cover letter.
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

  return `You are an expert career consultant and professional CV writer.

Your task is to produce TWO artefacts for the candidate below.

STEP 1 — ANALYSIS (do this internally before writing anything):
a. List every technology, skill, and requirement mentioned in the job description.
b. For each item, check whether it appears in the candidate's resume.
c. Build a clear mental map of what aligns, what is transferable, and what is absent.

STEP 2 — TAILORED CV
Rewrite the candidate's resume so it is closely aligned to the target job description,
guided strictly by your Step 1 analysis.

   STRICT RULES — you MUST follow every rule below without exception:
   - Only use information that is explicitly present in the candidate's original resume.
   - Do NOT invent, fabricate, or exaggerate any experience, skills, qualifications,
     technologies, or achievements that are not in the original resume.
   - Do NOT add the job title being applied for as if it were a previous or current
     work experience of the candidate.
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
