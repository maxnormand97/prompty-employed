import {
  CritiqueResult,
  HardFloorRuleId,
  PolicyAdjustment,
  PolicyEvaluationInput,
  PolicyEvaluationOutput,
  RedFlag,
} from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function clampMax(score: number, max: number): number {
  return Math.min(score, max);
}

function isSeniorityStrict(seniority: string): boolean {
  return ["SENIOR", "LEAD", "STAFF", "PRINCIPAL", "MANAGER"].includes(seniority);
}

function addHardFloor(
  hardFloorTriggers: HardFloorRuleId[],
  policyAdjustments: PolicyAdjustment[],
  id: HardFloorRuleId,
  penalty: number,
  reason: string
): void {
  if (!hardFloorTriggers.includes(id)) {
    hardFloorTriggers.push(id);
  }
  policyAdjustments.push({ ruleId: id, penalty, reason });
}

function addRedFlag(redFlags: RedFlag[], redFlag: RedFlag): void {
  if (
    !redFlags.some(
      (existing) => existing.type === redFlag.type && existing.description === redFlag.description
    )
  ) {
    redFlags.push(redFlag);
  }
}

// ── Employment duration parsing (date math only — language-agnostic) ───────

interface ParsedRoleDuration {
  months: number;
  isContractOrIntern: boolean;
  endYear: number;
}

function parseRoleDurations(cvText: string, currentYear: number): ParsedRoleDuration[] {
  const rows = cvText.split(/\n+/);
  const output: ParsedRoleDuration[] = [];

  for (const row of rows) {
    const period = row.match(/\b((19|20)\d{2})\s*[-–]\s*(Present|Current|(19|20)\d{2})\b/i);
    if (!period) {
      continue;
    }

    const startYear = Number(period[1]);
    const endYearToken = period[3];
    const endYear = /present|current/i.test(endYearToken) ? currentYear : Number(endYearToken);
    const months = Math.max(1, (endYear - startYear) * 12);
    const isContractOrIntern = /\b(contract|contractor|intern|internship)\b/i.test(row);

    output.push({ months, isContractOrIntern, endYear });
  }

  return output;
}

// ── Policy engine ──────────────────────────────────────────────────────────
//
// Only enforces rules that are:
//   1. Structurally deterministic  (date arithmetic, numeric extraction, tiny stable vocabularies)
//   2. Language/technology agnostic  (no framework or stack keyword lists)
//
// Everything else — stack coverage, domain fit, recency by technology, skill-level
// assessment — is delegated entirely to the model, which has the full JD and CV in
// context and requires no maintenance as the tech landscape evolves.

export function enforceCritiquePolicy(input: PolicyEvaluationInput): PolicyEvaluationOutput {
  const currentYear = new Date().getUTCFullYear();
  const seniorityStrict = isSeniorityStrict(input.normalization.seniority);
  const fullEvidenceText = `${input.tailoredCV}\n${input.coverLetter}`;

  const hardFloorTriggers: HardFloorRuleId[] = [...(input.modelResult.hardFloorTriggers ?? [])];
  const redFlags: RedFlag[] = [...(input.modelResult.redFlags ?? [])];
  const policyAdjustments: PolicyAdjustment[] = [...(input.modelResult.policyAdjustments ?? [])];

  let fitScore = clampScore(input.modelResult.fitScore);
  let likelihoodScore = clampScore(input.modelResult.likelihoodScore);

  // ── Hard floor: degree requirement ──────────────────────────────────────
  // Degree vocabulary (masters/phd) is tiny and universally stable.
  if (input.normalization.degreeRequirement) {
    const hasMastersOrHigher = /\b(master'?s|msc|ms\b|mba|phd|doctorate)\b/i.test(fullEvidenceText);
    const hasOnlyBachelors =
      /\b(bachelor'?s|bsc|bs\b)\b/i.test(fullEvidenceText) && !hasMastersOrHigher;
    if (hasOnlyBachelors) {
      likelihoodScore = clampMax(likelihoodScore, 35);
      addHardFloor(
        hardFloorTriggers,
        policyAdjustments,
        "HF_REQUIRED_MASTERS_MISSING",
        0,
        `Role requires ${input.normalization.degreeRequirement} or higher; evidence indicates only bachelor's degree.`
      );
      addRedFlag(redFlags, {
        type: "DEGREE_REQUIREMENT_MISSING",
        severity: "HIGH",
        description: `Explicit degree requirement (${input.normalization.degreeRequirement}) is not met.`,
      });
    }
  }

  // ── Hard floors: employment stability (pure date arithmetic) ────────────
  const roleDurations = parseRoleDurations(input.tailoredCV, currentYear);
  let consecutiveShort = 0;
  let maxConsecutiveShort = 0;
  for (const role of roleDurations) {
    if (!role.isContractOrIntern && role.months < 12) {
      consecutiveShort += 1;
      maxConsecutiveShort = Math.max(maxConsecutiveShort, consecutiveShort);
    } else {
      consecutiveShort = 0;
    }
  }

  if (maxConsecutiveShort >= 3) {
    likelihoodScore = clampMax(likelihoodScore, 40);
    addHardFloor(
      hardFloorTriggers,
      policyAdjustments,
      "HF_STABILITY_CONSEC_SHORT",
      0,
      "Detected 3 or more consecutive short non-contract roles under 12 months."
    );
    addRedFlag(redFlags, {
      type: "STABILITY_RISK",
      severity: "MEDIUM",
      description: "Multiple consecutive short tenures suggest potential stability risk.",
    });
  }

  const recentNonContractRoles = roleDurations.filter(
    (role) => !role.isContractOrIntern && role.endYear >= currentYear - 4
  );
  if (recentNonContractRoles.length >= 4) {
    likelihoodScore = clampMax(likelihoodScore, 35);
    addHardFloor(
      hardFloorTriggers,
      policyAdjustments,
      "HF_STABILITY_ROLE_CHURN",
      0,
      "Detected 4 or more non-contract roles within 4 years."
    );
    addRedFlag(redFlags, {
      type: "STABILITY_RISK",
      severity: "HIGH",
      description: "Role churn is high for a non-contractor profile in the last four years.",
    });
  }

  // ── Soft penalty: no measurable outcomes (numeric regex — language-agnostic) ──
  // Looks for numbers and units, not technology names. Works for any stack.
  if (
    seniorityStrict &&
    !/\b\d+%|\b\d+\s*(k|m|million|ms|users|requests|latency)\b/i.test(fullEvidenceText)
  ) {
    likelihoodScore = clampScore(likelihoodScore - 10);
    policyAdjustments.push({
      ruleId: "PENALTY_NO_MEASURABLE_OUTCOMES",
      penalty: 10,
      reason: "Senior/lead profile without measurable outcomes evidence.",
    });
  }

  const result: CritiqueResult = {
    ...input.modelResult,
    fitScore,
    likelihoodScore,
    hardFloorTriggers: hardFloorTriggers.length > 0 ? hardFloorTriggers : undefined,
    redFlags: redFlags.length > 0 ? redFlags : undefined,
    normalizationSummary: {
      seniority: input.normalization.seniority,
      requiredYears: input.normalization.requiredYears,
      degreeRequirement: input.normalization.degreeRequirement,
      uncertainLines: input.normalization.uncertainLines,
    },
    policyAdjustments: policyAdjustments.length > 0 ? policyAdjustments : undefined,
  };

  return { result };
}
