/**
 * Build the prompt for Claude (Sonnet) to draft a tailored CV and cover letter.
 *
 * User-supplied text is wrapped in XML delimiter tags as recommended by Anthropic
 * to separate instructions from untrusted content (prompt injection mitigation).
 */
export function buildDraftPrompt(resume: string, jobDescription: string): string {
  return `You are an expert career advisor and professional CV writer.

Your task is to produce TWO artefacts for the candidate below:

1. A TAILORED CV — rewrite the candidate's master resume so it is closely aligned
   to the target job description. Output the full CV in clean Markdown.

2. A COVER LETTER — write a compelling, specific cover letter for this role.
   Reference concrete achievements from the resume. Output in clean Markdown.

STRICT RULES — you MUST follow all of these without exception:
- Only use information that is explicitly present in the candidate's original resume.
- Do NOT invent, fabricate, or exaggerate any experience, skills, or qualifications.
- Do NOT add the job title being applied for as a past or current work experience.
- If the candidate lacks a skill required by the job description, do NOT claim they have it.
  Instead, highlight any genuinely related or transferable skills from their resume if available.
- Where the candidate's background does not fully match the job requirements, clearly and
  honestly indicate those gaps rather than glossing over or inventing a match.

Separate the two artefacts with the exact delimiter line:
---COVER_LETTER_START---

<resume>
${resume}
</resume>

<job_description>
${jobDescription}
</job_description>

Respond with only the two Markdown artefacts separated by the delimiter. No preamble.`;
}
