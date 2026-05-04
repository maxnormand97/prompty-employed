import {
  CritiqueResult,
  HardFloorRuleId,
  PolicyAdjustment,
  PolicyEvaluationInput,
  PolicyEvaluationOutput,
  RedFlag,
  RequirementCoverage,
} from "./types";

const HIGH_COMPLEXITY_DOMAINS = [
  "fintech",
  "medtech",
  "cybersecurity",
  "embedded",
  "hft",
  "hipaa",
  "pci-dss",
  "pci",
  "kernel",
];

const SCALE_NEGATIVE_SIGNALS = ["internal tool", "internal dashboard", "small site", "small website"];
const SCALE_POSITIVE_SIGNALS = [
  "distributed",
  "microservices",
  "high availability",
  "public api",
  "millions",
  "global scale",
  "high throughput",
  "low latency",
];

const GENERIC_EVIDENCE_HINTS: Record<string, string[]> = {
  sql: ["database management", "relational databases", "data querying"],
  aws: ["cloud infrastructure", "cloud platform"],
  kubernetes: ["container orchestration", "orchestration"],
};

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

function containsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function extractMostRecentYearForSkill(text: string, skill: string): number | undefined {
  const lower = text.toLowerCase();
  if (!lower.includes(skill.toLowerCase())) {
    return undefined;
  }

  const yearMatches = Array.from(text.matchAll(/\b(19|20)\d{2}\b/g)).map((m) => Number(m[0]));
  if (yearMatches.length === 0) {
    return undefined;
  }
  return Math.max(...yearMatches);
}

function estimateDomainYears(text: string, domain: string): number {
  const matches = Array.from(
    text.matchAll(new RegExp(`(\\d{1,2})\\+?\\s+years?[^\\n]{0,30}${domain}`, "ig"))
  );
  const explicit = matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
  if (explicit.length > 0) {
    return Math.max(...explicit);
  }
  return text.toLowerCase().includes(domain.toLowerCase()) ? 1 : 0;
}

function getRequirementCoverage(
  requirement: string,
  fullText: string,
  seniorityStrict: boolean,
  currentYear: number
): RequirementCoverage {
  const lower = fullText.toLowerCase();
  const reqLower = requirement.toLowerCase();

  if (lower.includes(reqLower)) {
    const lastUsedYear = extractMostRecentYearForSkill(fullText, requirement);
    if (lastUsedYear !== undefined) {
      const yearsAgo = currentYear - lastUsedYear;
      if (yearsAgo > 5 && seniorityStrict) {
        return {
          requirement,
          status: "MISSING",
          evidenceSummary: `${requirement} appears only in old experience (>5 years).`,
        };
      }
      if (yearsAgo > 3 && seniorityStrict) {
        return {
          requirement,
          status: "MISSING",
          evidenceSummary: `${requirement} last used ${yearsAgo} years ago; treated as missing for seniority.`,
        };
      }
      if (yearsAgo > 2) {
        return {
          requirement,
          status: "PARTIAL",
          evidenceSummary: `${requirement} last used ${yearsAgo} years ago; recency discount applied.`,
        };
      }
      return {
        requirement,
        status: "MET",
        evidenceSummary: `${requirement} found in recent evidence.`,
      };
    }

    return {
      requirement,
      status: "MET",
      evidenceSummary: `${requirement} explicitly present in candidate artefacts.`,
    };
  }

  const genericHints = GENERIC_EVIDENCE_HINTS[reqLower] ?? [];
  if (genericHints.some((hint) => lower.includes(hint))) {
    return {
      requirement,
      status: "WEAK_EVIDENCE",
      evidenceSummary: `${requirement} not explicit; generic related wording found.`,
    };
  }

  return {
    requirement,
    status: "MISSING",
    evidenceSummary: `${requirement} not found in candidate artefacts.`,
  };
}

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

function addRedFlag(redFlags: RedFlag[], redFlag: RedFlag): void {
  if (
    !redFlags.some(
      (existing) => existing.type === redFlag.type && existing.description === redFlag.description
    )
  ) {
    redFlags.push(redFlag);
  }
}

function computeConfidence(base: number, coverage: RequirementCoverage[], redFlags: RedFlag[]): number {
  const missingCount = coverage.filter((c) => c.status === "MISSING").length;
  const weakCount = coverage.filter((c) => c.status === "WEAK_EVIDENCE").length;
  const highFlags = redFlags.filter((f) => f.severity === "HIGH").length;
  const mediumFlags = redFlags.filter((f) => f.severity === "MEDIUM").length;

  const score = base - missingCount * 10 - weakCount * 5 - highFlags * 10 - mediumFlags * 5;
  return clampScore(score);
}

export function enforceCritiquePolicy(input: PolicyEvaluationInput): PolicyEvaluationOutput {
  const currentYear = new Date().getUTCFullYear();
  const seniorityStrict = isSeniorityStrict(input.normalization.seniority);
  const fullEvidenceText = `${input.tailoredCV}\n${input.coverLetter}`;

  const hardFloorTriggers: HardFloorRuleId[] = [...(input.modelResult.hardFloorTriggers ?? [])];
  const redFlags: RedFlag[] = [...(input.modelResult.redFlags ?? [])];
  const policyAdjustments: PolicyAdjustment[] = [...(input.modelResult.policyAdjustments ?? [])];

  let fitScore = clampScore(input.modelResult.fitScore);
  let likelihoodScore = clampScore(input.modelResult.likelihoodScore);

  const requirementsCoverage: RequirementCoverage[] = input.normalization.mandatoryStack.map((req) =>
    getRequirementCoverage(req, fullEvidenceText, seniorityStrict, currentYear)
  );

  const primaryDomain = input.normalization.primaryDomain;
  const hasPrimaryDomainEvidence = primaryDomain
    ? fullEvidenceText.toLowerCase().includes(primaryDomain.toLowerCase())
    : true;

  if (primaryDomain && !hasPrimaryDomainEvidence) {
    fitScore = clampMax(fitScore, 20);
    likelihoodScore = clampMax(likelihoodScore, 20);
    addHardFloor(
      hardFloorTriggers,
      policyAdjustments,
      "HF_NO_PRIMARY_DOMAIN_EVIDENCE",
      0,
      `No primary domain evidence found for ${primaryDomain}.`
    );
    addRedFlag(redFlags, {
      type: "DOMAIN_EVIDENCE_MISSING",
      severity: "HIGH",
      description: `No clear evidence for primary domain requirement: ${primaryDomain}.`,
    });
  }

  if (primaryDomain && input.normalization.requiredYears) {
    const estimatedYears = estimateDomainYears(fullEvidenceText, primaryDomain);
    if (estimatedYears < input.normalization.requiredYears) {
      likelihoodScore = clampMax(likelihoodScore, 30);
      addHardFloor(
        hardFloorTriggers,
        policyAdjustments,
        "HF_DOMAIN_YEARS_SHORTFALL",
        0,
        `Required ${input.normalization.requiredYears}+ years in ${primaryDomain}, found ${estimatedYears}.`
      );
    }
  }

  if (input.normalization.degreeRequirement) {
    const hasMastersOrHigher = /\b(master'?s|msc|ms\b|mba|phd|doctorate)\b/i.test(fullEvidenceText);
    const hasOnlyBachelors = /\b(bachelor'?s|bsc|bs\b)\b/i.test(fullEvidenceText) && !hasMastersOrHigher;
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

  const isComplexDomain =
    containsAny(input.normalization.domainSignals.join(" "), HIGH_COMPLEXITY_DOMAINS) ||
    containsAny(input.normalization.complianceSignals.join(" "), HIGH_COMPLEXITY_DOMAINS);

  if (isComplexDomain && !hasPrimaryDomainEvidence) {
    likelihoodScore = clampScore(likelihoodScore - 20);
    policyAdjustments.push({
      ruleId: "PENALTY_COMPLEX_DOMAIN_GAP",
      penalty: 20,
      reason: "High-complexity/compliance domain without supporting candidate evidence.",
    });
    addRedFlag(redFlags, {
      type: "COMPLIANCE_DOMAIN_GAP",
      severity: "HIGH",
      description:
        "Role has high-complexity or compliance-sensitive domain signals with insufficient matching domain evidence.",
    });
  }

  const mandatoryMissing = requirementsCoverage.filter((c) => c.status === "MISSING");
  const mandatoryPartial = requirementsCoverage.filter((c) => c.status === "PARTIAL");

  if (seniorityStrict && mandatoryMissing.length > 0) {
    addRedFlag(redFlags, {
      type: "RECENCY_GAP",
      severity: "HIGH",
      description: "Primary stack has not been used recently enough for this role level.",
    });
  }

  if (mandatoryPartial.length > 0) {
    policyAdjustments.push({
      ruleId: "PENALTY_SKILL_RECENCY_DISCOUNT",
      penalty: mandatoryPartial.length * 5,
      reason: "One or more required skills are present but stale (>2 years).",
    });
    likelihoodScore = clampScore(likelihoodScore - mandatoryPartial.length * 5);
  }

  const recentSection = input.tailoredCV.slice(0, 1200).toLowerCase();
  const appearsOnlyOlder = input.normalization.mandatoryStack.some((stackItem) => {
    const item = stackItem.toLowerCase();
    return fullEvidenceText.toLowerCase().includes(item) && !recentSection.includes(item);
  });
  if (appearsOnlyOlder) {
    likelihoodScore = clampScore(likelihoodScore - 15);
    policyAdjustments.push({
      ruleId: "PENALTY_PRIMARY_STACK_NOT_RECENT",
      penalty: 15,
      reason: "Primary stack appears only in older experience blocks.",
    });
    addRedFlag(redFlags, {
      type: "RECENCY_GAP",
      severity: "HIGH",
      description: "Primary stack appears only in older experience and not in recent role evidence.",
    });
  }

  const requiresScale = input.normalization.scaleSignals.length > 0;
  const hasScalePositiveEvidence = containsAny(fullEvidenceText, SCALE_POSITIVE_SIGNALS);
  const hasScaleNegativeEvidence = containsAny(fullEvidenceText, SCALE_NEGATIVE_SIGNALS);
  if (requiresScale && hasScaleNegativeEvidence && !hasScalePositiveEvidence) {
    fitScore = clampMax(fitScore, 50);
    addHardFloor(
      hardFloorTriggers,
      policyAdjustments,
      "HF_SCALE_MISMATCH",
      0,
      "Scale requirements present in JD without convincing high-scale evidence."
    );
    addRedFlag(redFlags, {
      type: "SCALE_MISMATCH",
      severity: "MEDIUM",
      description:
        "JD requires high-scale distributed systems evidence not clearly present in recent experience.",
    });
  }

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

  if (input.normalization.stabilitySensitiveWording.length > 0) {
    const longRoleWithoutProgression = /\b(19|20)\d{2}\s*[-–]\s*(Present|Current|(19|20)\d{2})\b/i.test(
      input.tailoredCV
    );
    if (longRoleWithoutProgression && /\b7\+?\s*years?\b/i.test(input.tailoredCV)) {
      addRedFlag(redFlags, {
        type: "STABILITY_RISK",
        severity: "LOW",
        description:
          "Potential stagnation: long tenure without clear progression while JD signals high-growth expectations.",
      });
    }
  }

  if (requirementsCoverage.some((c) => c.status === "WEAK_EVIDENCE")) {
    addRedFlag(redFlags, {
      type: "EVIDENCE_QUALITY",
      severity: "MEDIUM",
      description: "Some requirements are inferred only from generic wording, not explicit tool evidence.",
    });
  }

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
    addRedFlag(redFlags, {
      type: "EVIDENCE_QUALITY",
      severity: "MEDIUM",
      description: "Role seniority implies impact ownership, but measurable outcomes are limited.",
    });
  }

  const confidenceScore = computeConfidence(85, requirementsCoverage, redFlags);

  const result: CritiqueResult = {
    ...input.modelResult,
    fitScore: clampScore(fitScore),
    likelihoodScore: clampScore(likelihoodScore),
    redFlags,
    hardFloorTriggers,
    requirementsCoverage,
    confidenceScore,
    normalizationSummary: {
      seniority: input.normalization.seniority,
      requiredYears: input.normalization.requiredYears,
      mandatoryStack: input.normalization.mandatoryStack,
      complianceSignals: input.normalization.complianceSignals,
      domainSignals: input.normalization.domainSignals,
      scaleSignals: input.normalization.scaleSignals,
      stabilitySensitiveWording: input.normalization.stabilitySensitiveWording,
      degreeRequirement: input.normalization.degreeRequirement,
      uncertainLines: input.normalization.uncertainLines,
    },
    policyAdjustments,
  };

  return { result };
}
