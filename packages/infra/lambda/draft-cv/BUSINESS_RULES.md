# DraftCV Lambda — Business Rules & Logic

This document describes every business rule, prompt instruction, strict constraint, and flow
decision implemented in the `draft-cv` lambda.  It is intended for developers and AI agents
working in this codebase.

---

## Overview

The `draft-cv` lambda is the first node in the `TailorCVWorkflow` Step Function.  Its job is to:

1. Run a **cheap pre-screening call** (Claude Haiku) to gate whether the candidate has any
   reasonable basis to apply before incurring the cost of a full draft.
2. If the candidate passes, run a **full draft call** (Claude Sonnet or equivalent) to produce a
   tailored CV and cover letter aligned to the job description.
3. Return S3 keys for both artefacts so the next step (`critique-cv`) can evaluate them.

```
S3 (resume + JD [+ company info])
    │
    ▼
Pre-screen prompt → Claude Haiku (cheap)
    │
    ├─ NO_FIT ──► write canned analysis.json →  DynamoDB COMPLETE  →  return NO_FIT
    │
    └─ FIT ──────► Draft prompt → Claude Sonnet (full)
                       │
                       ▼
                   Split on delimiter
                       │
                   Write tailored-cv.md + cover-letter.md to S3
                       │
                   DynamoDB (no status change here; critique-cv sets COMPLETE)
                       │
                   Return FIT + S3 keys
```

---

## Stage 1 — Pre-screening (`buildScreenPrompt`)

### Purpose

Determine whether the candidate has **any reasonable basis** to apply for the role.  This is an
intentionally low bar — it only screens out completely misaligned applications (e.g. 3D artist CV
against a software engineering role).

### Prompt rules

- The model is asked a single binary question: does this candidate have a reasonable basis to apply?
- Response must be JSON only:

```json
{ "verdict": "YES" | "NO", "reason": "<one sentence>" }
```

- No markdown fences, no preamble.
- The model is identified as a "senior recruiter screening candidates".

### Verdict parsing — strict mode

| Condition | Verdict applied | Behaviour |
|---|---|---|
| `verdict === "NO"` | `NO_FIT` | Skip draft; write canned result; mark COMPLETE |
| `verdict === "YES"` (or any other value) | `FIT` | Continue to full draft |
| Malformed / non-JSON response | `NO_FIT` | **Strict-safe fallback** — see below |

#### Strict-safe fallback on malformed output

If the pre-screen response cannot be parsed as JSON, the lambda **fails safe to `NO_FIT`** rather
than proceeding to an expensive draft call on a potentially invalid basis.

The `fitReason` is set to:
> `"Strict-safe fallback triggered: pre-screen output was malformed and cannot be trusted."`

This is logged as `WARN` and persisted in the canned NO_FIT analysis JSON for audit purposes.

**Rationale:** A malformed response from the screening model indicates an unknown state.  Assuming
FIT in that case would waste the full draft budget and could produce misleading output.  Treating
it as NO_FIT is the safer, cheaper, and more auditable choice.

---

## Stage 2 — NO_FIT fast path

When pre-screen returns `NO_FIT`, no draft is generated.  A canned analysis JSON is written to S3
with the following fixed values:

```jsonc
{
  "fitVerdict": "NO_FIT",
  "fitReason": "<reason from screen or strict-safe fallback message>",
  "critiqueNotes": "Automated pre-screening determined the candidate does not have a sufficient basis to apply for this role. Reason: <fitReason>",
  "fitScore": 5,
  "fitRationale": "The candidate lacks the minimum qualifications or experience required for this role based on automated pre-screening.",
  "likelihoodScore": 5,
  "likelihoodRationale": "The candidate would not be expected to pass initial screening for this role.",
  "suggestedImprovements": [],
  "gapAnalysis": [],
  "companySummary": ""
}
```

The job is then marked `COMPLETE` in DynamoDB (not `FAILED`).

---

## Stage 3 — Full draft (`buildDraftPrompt` + system prompt)

### System prompt — WORK HISTORY LOCK

The system prompt (sent at the top-level `system` field for higher authority) contains a single
absolute hard rule:

> **ABSOLUTE HARD RULE — WORK HISTORY LOCK:**
> The ONLY employers, job titles, and employment dates you may include in the tailored CV
> are those present verbatim in the candidate's `<resume>`.  The company the candidate is
> **APPLYING TO** is NOT an employer in their work history.  Listing the target company as a
> current or previous employer is a critical, disqualifying error that renders the output unusable.
> **This rule overrides every other instruction.**

This rule is also reinforced in the user-turn prompt.

### Draft prompt — STRICT RULES (anti-hallucination)

The candidate must complete three internal steps before producing output:

**STEP 1 — Analysis (internal, not output):**
Build a complete mental map of every technology, skill, and requirement in the JD vs what is
present in the resume.

**STEP 1.5 — WORK HISTORY LOCK (internal, not output):**
List every employer name and job title from the resume exactly as written.  This is the complete
immutable set of work experience permitted in the output.

**STEP 2 — Tailored CV:**

Mandatory constraints on the tailored CV:

| Rule | Description |
|---|---|
| No fabrication | Only use information explicitly present in the resume |
| No hallucination | Do not invent, fabricate, or exaggerate any experience, skills, qualifications, technologies, or achievements |
| No target company | The target company must not appear as a current or previous employer |
| No job title invention | Do not add the applied-for job title as if it were previous/current experience |
| No absent skills | If a required skill is absent from the resume, do not claim it |
| Preserve factual anchors | Job titles, employer names, and employment dates must be preserved exactly |
| Reframing is permitted | Reordering, reframing, and emphasising existing content to best match the role is allowed |

Output format: clean Markdown.

**STEP 3 — Cover letter:**

| Rule | Description |
|---|---|
| Same fabrication rules | All STEP 2 rules apply to the cover letter |
| Honesty about fit | If the match is partial or the candidate lacks key requirements, acknowledge this plainly |
| No false employment | Do not imply the candidate already works at the target company |
| Company-specific content | When company info is supplied, reference values, products, or mission where genuinely relevant |

Output format: clean Markdown.

### Claude prefill trick

The assistant turn is prefilled with `"#"` to force Claude to begin the tailored CV immediately
with a Markdown heading.  This prevents preamble text like "Here are the two artefacts:" from
appearing at the start of the CV output.

The auto-generated title heading (e.g. `# Tailored CV`) is then stripped from the CV text before
being written to S3.

### Output delimiter

The two artefacts are separated by the exact string:

```
---COVER_LETTER_START---
```

Any response missing this delimiter throws:
> `"Bedrock response missing cover letter delimiter"`

An empty CV or cover letter section after splitting throws:
> `"Bedrock response produced empty CV or cover letter"`

---

## Audit artefacts

All input prompts and raw model responses are persisted to S3 under `results/{jobId}/audit/` for
observability and future model training:

| Key | Contents |
|---|---|
| `audit/screen-prompt.txt` | Pre-screen prompt text |
| `audit/screen-raw-response.txt` | Raw Haiku response |
| `audit/draft-prompt.txt` | Full draft prompt text (FIT path only) |
| `audit/draft-raw-response.txt` | Raw Sonnet response (FIT path only) |

---

## DynamoDB status transitions

| Event | Status written |
|---|---|
| Lambda starts | `DRAFTING` |
| NO_FIT fast path completes | `COMPLETE` |
| Full draft completes (FIT path) | no write — `critique-cv` writes `COMPLETE` |
| Any unhandled error | `FAILED` with `errorMessage` attribute |

---

## Output contract

### FIT path

```jsonc
{
  "jobId": "...",
  "fitVerdict": "FIT",
  "s3TailoredCVKey": "results/{jobId}/tailored-cv.md",
  "s3CoverLetterKey": "results/{jobId}/cover-letter.md",
  "s3JobDescKey": "inputs/{jobId}/job-desc.txt",
  "s3CompanyInfoKey": "inputs/{jobId}/company-info.txt"  // optional
}
```

### NO_FIT path

```jsonc
{
  "jobId": "...",
  "fitVerdict": "NO_FIT",
  "fitReason": "...",
  "s3JobDescKey": "inputs/{jobId}/job-desc.txt",
  "s3CompanyInfoKey": "inputs/{jobId}/company-info.txt"  // optional
}
```

`s3TailoredCVKey` and `s3CoverLetterKey` are absent on the NO_FIT path.

---

## Key implementation files

| File | Purpose |
|---|---|
| `lib/prompt.ts` | `buildScreenPrompt`, `buildDraftPrompt`, `DRAFT_SYSTEM_PROMPT` |
| `core.ts` | Orchestration: S3 reads, pre-screen, draft, split, S3 writes, DynamoDB |
| `lib/types.ts` | `DraftCVInput`, `DraftCVOutput`, `DraftCVClients`, `DraftCVEnv` |
| `lib/s3.ts` | `readS3Object`, `writeS3Object` |
| `lib/dynamo.ts` | `setJobStatus`, `setJobComplete` |
| `lib/bedrock.ts` | `invokeBedrockText` |
