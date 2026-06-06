# CritiqueCV Lambda — Business Rules & Logic

This document describes every business rule, scoring constraint, prompt instruction, and normalization
behaviour implemented in the `critique-cv` lambda.  It is intended for developers and AI agents
working in this codebase.

---

## Overview

The `critique-cv` lambda is the second node in the `TailorCVWorkflow` Step Function.  It receives
three artefacts (tailored CV, cover letter, job description) plus optional company background text
that were produced or stored by the `draft-cv` lambda, feeds them to a large language model (Claude
via Amazon Bedrock) for qualitative analysis, and then applies a **deterministic policy engine**
that enforces hard floors and penalties on top of whatever scores the model suggests.

The final persisted result is the policy-adjusted output, never the raw model output alone.

```
S3 artefacts
    │
    ▼
JD Normalisation  ──►  RoleNormalization object
    │
    ▼
Bedrock (Claude)  ──►  model fitScore / likelihoodScore / qualitative fields
    │
    ▼
Policy Engine     ──►  clamped scores + redFlags + hardFloorTriggers + ...
    │
    ▼
S3 analysis.json  +  DynamoDB COMPLETE
```

---

## Stage 1 — JD Normalisation (`lib/normalization.ts`)

Before calling Bedrock, the raw job description text is parsed into a structured
`RoleNormalization` object.  This object drives every deterministic check in Stage 3.

### Extracted fields

| Field | Description |
|---|---|
| `seniority` | PRINCIPAL / STAFF / LEAD / SENIOR / MANAGER / MID / JUNIOR / UNSPECIFIED |
| `requiredYears` | Minimum years of experience extracted from phrases like "5+ years experience" |
| `primaryDomain` | First domain signal found (e.g. `fintech`, `medtech`) |
| `mandatoryStack` | Technology keywords matched against a known dictionary |
| `complianceSignals` | Regulatory/compliance signals: `hipaa`, `pci-dss`, `soc2`, `gdpr`, etc. |
| `domainSignals` | Domain keywords: `saas`, `fintech`, `medtech`, `cybersecurity`, `hft`, etc. |
| `scaleSignals` | Scale-related phrases: `microservices`, `distributed systems`, `high availability`, etc. |
| `stabilitySensitiveWording` | Growth/pace signals: `fast-paced`, `high growth`, `ownership`, etc. |
| `degreeRequirement` | `MASTERS` or `PHD` when explicitly stated |
| `uncertainLines` | Lines containing `preferred`, `nice to have`, `bonus`, `ideally`, `familiarity` — not treated as mandatory |
| `rawJobDescription` | Kept verbatim for audit and prompt construction |

### Seniority detection priority

Patterns are evaluated in this order; the first match wins:

1. `PRINCIPAL`
2. `STAFF`
3. `LEAD`
4. `SENIOR`
5. `MANAGER` (also matches `head of`, `director`, `vp`)
6. `MID` / `INTERMEDIATE`
7. `JUNIOR` / `ENTRY-LEVEL`
8. `UNSPECIFIED` (fallback)

### Required-years extraction

Matches patterns in order of specificity:

1. `minimum N years`, `at least N years`, `required N years`
2. `N years of experience`, `N years exp`
3. `N years in …`

---

## Stage 2 — Bedrock Prompt (`lib/prompt.ts`)

The model is instructed to score and analyse the candidate.  Key prompt rules told to the model:

### Scoring bands

**fitScore** — how well demonstrated experience maps to stated requirements:

| Range | Meaning |
|---|---|
| 0–15 | Little to no relevant experience; core domain entirely missing |
| 16–35 | Some peripheral overlap but fundamental domain or skill gaps |
| 36–55 | Partial match; relevant background exists but notable gaps remain |
| 56–75 | Good match; most requirements met with minor gaps |
| 76–100 | Strong match; experience closely mirrors requirements |

**likelihoodScore** — realistic chance of progressing to interview at a competitive employer:

| Range | Meaning |
|---|---|
| 0–15 | Would not pass automated screening or initial CV review |
| 16–35 | Very unlikely to be shortlisted |
| 36–55 | Outside bet — may get a look if the hiring pool is thin |
| 56–75 | Competitive candidate; likely to be considered alongside others |
| 76–100 | Strong shortlist candidate |

### Hard floor rules in the prompt (guidance to the model)

These are also enforced deterministically in Stage 3.  They are stated in the prompt so the model
can provide accurate rationale text:

- If the JD requires N+ years in a specific domain and the candidate demonstrates fewer: `likelihoodScore` must not exceed **30**.
- If the role explicitly requires a master's degree or higher and the candidate only holds a bachelor's: `likelihoodScore` must not exceed **35**.
- If the candidate has no demonstrable experience in the primary domain: both `fitScore` and `likelihoodScore` must not exceed **20**.
- A well-written CV does **not** compensate for missing experience.

### Model output schema

```jsonc
{
  "critiqueNotes": "...",
  "fitScore": 0–100,
  "fitRationale": "...",
  "likelihoodScore": 0–100,
  "likelihoodRationale": "...",
  "suggestedImprovements": ["..."],
  "gapAnalysis": [
    { "gap": "...", "advice": "...", "priority": "HIGH|MEDIUM|LOW" }
  ],
  "companySummary": "..."   // optional, populated only when company info supplied
}
```

All fields are validated on parse.  Any deviation throws and the job is marked `FAILED`.

---

## Stage 3 — Deterministic Policy Engine (`lib/policy.ts`)

This stage runs after parsing the model response.  It **overrides** model scores where business
rules apply and appends structured explainability fields to the result.

### Seniority-strict mode

Rules that reference "strict seniority" apply when `seniority` is one of:
`SENIOR`, `LEAD`, `STAFF`, `PRINCIPAL`, `MANAGER`.

---

### Hard floor rules

These rules **clamp scores to a ceiling** and add entries to `hardFloorTriggers[]`.

#### HF_NO_PRIMARY_DOMAIN_EVIDENCE

**Trigger:** `primaryDomain` was extracted from the JD AND the combined tailored CV + cover letter text contains no mention of that domain.

**Effect:**
- `fitScore` clamped to max **20**
- `likelihoodScore` clamped to max **20**
- Red flag: `DOMAIN_EVIDENCE_MISSING` / HIGH

---

#### HF_DOMAIN_YEARS_SHORTFALL

**Trigger:** `primaryDomain` was extracted AND `requiredYears` was extracted AND the estimated years
of domain experience found in the candidate artefacts is less than `requiredYears`.

Years estimation: regex scan for phrases like `"N years … <domain>"` in evidence text; falls back to
`1` if the domain keyword is merely present, or `0` if absent.

**Effect:**
- `likelihoodScore` clamped to max **30**

---

#### HF_REQUIRED_MASTERS_MISSING

**Trigger:** JD `degreeRequirement` is `MASTERS` or `PHD` AND the candidate evidence contains a
bachelor's-level indicator (`bachelor's`, `bsc`, `bs`) without any master's-or-higher indicator
(`master's`, `msc`, `mba`, `phd`, `doctorate`).

**Effect:**
- `likelihoodScore` clamped to max **35**
- Red flag: `DEGREE_REQUIREMENT_MISSING` / HIGH

---

#### HF_SCALE_MISMATCH

**Trigger:** JD has scale signals (any of `microservices`, `distributed systems`, `high availability`,
`public api`, `millions`, `global scale`, `high throughput`, `low latency`) AND the candidate evidence
contains small-scale negative signals (`internal tool`, `internal dashboard`, `small site`,
`small website`) but contains **none** of the positive scale signals.

**Effect:**
- `fitScore` clamped to max **50**
- Red flag: `SCALE_MISMATCH` / MEDIUM

---

#### HF_STABILITY_CONSEC_SHORT

**Trigger:** 3 or more consecutive non-contract, non-intern role tenures under 12 months detected by parsing
date ranges (`YYYY–YYYY` or `YYYY–Present`) in the CV text.

**Effect:**
- `likelihoodScore` clamped to max **40**
- Red flag: `STABILITY_RISK` / MEDIUM

---

#### HF_STABILITY_ROLE_CHURN

**Trigger:** 4 or more non-contract roles with end years within the last 4 years.

**Effect:**
- `likelihoodScore` clamped to max **35**
- Red flag: `STABILITY_RISK` / HIGH

---

### Soft penalties

These rules **subtract from scores** and add entries to `policyAdjustments[]`.  They stack with hard
floor clamps (the clamp is applied after any penalty reduction).

#### PENALTY_COMPLEX_DOMAIN_GAP

**Trigger:** JD domain or compliance signals contain a high-complexity indicator (`fintech`, `medtech`,
`cybersecurity`, `embedded`, `hft`, `hipaa`, `pci-dss`, `pci`, `kernel`) AND `primaryDomain` is
absent from candidate evidence.

**Effect:** `likelihoodScore` reduced by **20**

---

#### PENALTY_SKILL_RECENCY_DISCOUNT

**Trigger:** One or more mandatory stack items were detected in the candidate evidence but appear only
in dates older than **2 years** from today (via year-pattern extraction).

For strict-seniority roles: items older than **3 years** are treated as `MISSING`; older than **5 years**
are treated as `MISSING` regardless of seniority.

**Effect:** `likelihoodScore` reduced by **5 per stale skill**

---

#### PENALTY_PRIMARY_STACK_NOT_RECENT

**Trigger:** A mandatory stack item is present anywhere in the full evidence text but is absent from
the first 1 200 characters of the tailored CV (considered the "recent/prominent" section).

**Effect:** `likelihoodScore` reduced by **15**

---

#### PENALTY_NO_MEASURABLE_OUTCOMES

**Trigger:** Strict-seniority role AND the full evidence text contains no measurable outcome patterns
(no `N%`, no `Nk`, `Nm`, `N million`, `N ms`, `N users`, `N requests`, `N latency`).

**Effect:** `likelihoodScore` reduced by **10**

---

### Requirement coverage tracking

For every item in `mandatoryStack`, the engine computes a `RequirementCoverage` entry:

| Status | Condition |
|---|---|
| `MET` | Keyword found, last year within 2 years (or no year found) |
| `PARTIAL` | Keyword found but last year > 2 years ago |
| `MISSING` | Keyword not found; or last year > 3 years for seniority-strict; or > 5 years regardless |
| `WEAK_EVIDENCE` | Keyword not found but generic synonyms present (see table below) |

Generic synonym detection:

| Required skill | Accepted weak synonyms |
|---|---|
| `sql` | `database management`, `relational databases`, `data querying` |
| `aws` | `cloud infrastructure`, `cloud platform` |
| `kubernetes` | `container orchestration`, `orchestration` |

---

### Confidence score

A single integer 0–100 computed after all rules run:

```
confidenceScore = 85
  - 10 × (MISSING requirements count)
  - 5  × (WEAK_EVIDENCE requirements count)
  - 10 × (HIGH severity red flags count)
  - 5  × (MEDIUM severity red flags count)
```

Clamped to [0, 100].

---

### Red flag types

| Type | Description |
|---|---|
| `RECENCY_GAP` | Primary or mandatory stack last used beyond acceptable recency threshold |
| `SCALE_MISMATCH` | JD requires scale; candidate evidence shows only small/internal-scale work |
| `STABILITY_RISK` | Consecutive short tenures or high churn rate |
| `COMPLIANCE_DOMAIN_GAP` | High-compliance/complexity domain with no matching candidate evidence |
| `EVIDENCE_QUALITY` | Requirements met only by generic wording, or no measurable outcomes |
| `DEGREE_REQUIREMENT_MISSING` | Explicit degree requirement exceeds candidate's stated education |
| `DOMAIN_EVIDENCE_MISSING` | Primary domain entirely absent from candidate artefacts |

Severity levels: `LOW`, `MEDIUM`, `HIGH`.

---

## Result JSON schema (persisted to S3 and returned)

All fields from the model are preserved.  The following fields are added or overridden by the
policy engine:

```jsonc
{
  // ── Existing fields (model output, validated) ──────────────────────────
  "critiqueNotes": "...",
  "fitScore": 0–100,           // clamped by policy
  "fitVerdict": "FIT|NO_FIT",  // optional
  "fitRationale": "...",
  "likelihoodScore": 0–100,    // clamped by policy
  "likelihoodRationale": "...",
  "suggestedImprovements": ["..."],
  "gapAnalysis": [{ "gap": "...", "advice": "...", "priority": "HIGH|MEDIUM|LOW" }],
  "companySummary": "...",

  // ── Decision-grade fields added by policy engine (all optional) ────────
  "redFlags": [
    { "type": "RECENCY_GAP", "severity": "HIGH", "description": "..." }
  ],
  "hardFloorTriggers": ["HF_DOMAIN_YEARS_SHORTFALL"],
  "requirementsCoverage": [
    { "requirement": "typescript", "status": "MET", "evidenceSummary": "..." }
  ],
  "confidenceScore": 64,
  "normalizationSummary": {
    "seniority": "SENIOR",
    "requiredYears": 5,
    "mandatoryStack": ["typescript", "sql"],
    "complianceSignals": ["pci-dss"],
    "domainSignals": ["fintech"],
    "scaleSignals": ["distributed systems"],
    "stabilitySensitiveWording": ["fast-paced"],
    "degreeRequirement": "MASTERS",
    "uncertainLines": ["Nice to have: Rust experience"]
  },
  "policyAdjustments": [
    { "ruleId": "PENALTY_PRIMARY_STACK_NOT_RECENT", "penalty": 15, "reason": "..." }
  ]
}
```

---

## Rule evaluation order

Rules are evaluated in this sequence within `enforceCritiquePolicy`:

1. Requirement coverage computation (for all mandatory stack items)
2. `HF_NO_PRIMARY_DOMAIN_EVIDENCE` — score ceilings + `DOMAIN_EVIDENCE_MISSING` red flag
3. `HF_DOMAIN_YEARS_SHORTFALL` — likelihood ceiling
4. `HF_REQUIRED_MASTERS_MISSING` — likelihood ceiling + `DEGREE_REQUIREMENT_MISSING` red flag
5. `PENALTY_COMPLEX_DOMAIN_GAP` — likelihood penalty + `COMPLIANCE_DOMAIN_GAP` red flag
6. `RECENCY_GAP` red flag (if seniority-strict and any required items are MISSING)
7. `PENALTY_SKILL_RECENCY_DISCOUNT` — likelihood penalty per stale skill
8. `PENALTY_PRIMARY_STACK_NOT_RECENT` — likelihood penalty + `RECENCY_GAP` red flag
9. `HF_SCALE_MISMATCH` — fit ceiling + `SCALE_MISMATCH` red flag
10. `HF_STABILITY_CONSEC_SHORT` — likelihood ceiling + `STABILITY_RISK` red flag
11. `HF_STABILITY_ROLE_CHURN` — likelihood ceiling + `STABILITY_RISK` red flag
12. Stagnation check — `STABILITY_RISK` LOW red flag (long tenure + stability-sensitive JD)
13. Weak evidence check — `EVIDENCE_QUALITY` red flag
14. `PENALTY_NO_MEASURABLE_OUTCOMES` — likelihood penalty + `EVIDENCE_QUALITY` red flag
15. Confidence score computed from final coverage + red flags

Score clamps are applied after all penalties have been subtracted.

---

## Key implementation files

| File | Purpose |
|---|---|
| `lib/normalization.ts` | JD parsing → `RoleNormalization` |
| `lib/policy.ts` | All rule evaluation, clamping, penalties, red flags |
| `lib/prompt.ts` | Claude prompt construction |
| `lib/response.ts` | Model JSON parse + schema validation |
| `core.ts` | Orchestration: S3 reads, Bedrock call, policy, S3 write, DynamoDB |
| `lib/types.ts` | All TypeScript interfaces and union types |
