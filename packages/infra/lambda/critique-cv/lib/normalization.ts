import { RoleNormalization } from "./types";

// Seniority vocabulary is small, stable, and language-agnostic — safe to hard-code.
const SENIORITY_PATTERNS: Array<{ value: string; pattern: RegExp }> = [
  { value: "PRINCIPAL", pattern: /\bprincipal\b/i },
  { value: "STAFF", pattern: /\bstaff\b/i },
  { value: "LEAD", pattern: /\blead\b/i },
  { value: "SENIOR", pattern: /\bsenior\b/i },
  { value: "MANAGER", pattern: /\b(manager|head of|director|vp)\b/i },
  { value: "MID", pattern: /\b(mid|intermediate)\b/i },
  { value: "JUNIOR", pattern: /\bjunior|entry[- ]level\b/i },
];

function inferSeniority(text: string): string {
  for (const candidate of SENIORITY_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return candidate.value;
    }
  }
  return "UNSPECIFIED";
}

// Year extraction uses numeric patterns, not technology vocabulary — always correct.
function extractRequiredYears(text: string): number | undefined {
  const patterns = [
    /(?:minimum|min\.?|at least|required)\s*(\d{1,2})\+?\s*years?/i,
    /(\d{1,2})\+?\s*years?\s*(?:of)?\s*(?:experience|exp)/i,
    /(\d{1,2})\+?\s*years?[^\n]{0,25}\bin\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return undefined;
}

// Degree vocabulary is tiny, stable, and universal — safe to hard-code.
function extractDegreeRequirement(text: string): "MASTERS" | "PHD" | undefined {
  if (/\b(phd|doctorate)\b/i.test(text)) {
    return "PHD";
  }
  if (/\b(master'?s|msc|ms\b|mba)\b/i.test(text)) {
    return "MASTERS";
  }
  return undefined;
}

function extractUncertainLines(jobDescription: string): string[] {
  return jobDescription
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => /\b(preferred|nice to have|bonus|plus|ideally|familiarity)\b/i.test(line));
}

export function normalizeJobDescription(jobDescription: string): RoleNormalization {
  return {
    rawJobDescription: jobDescription,
    seniority: inferSeniority(jobDescription),
    requiredYears: extractRequiredYears(jobDescription),
    degreeRequirement: extractDegreeRequirement(jobDescription),
    uncertainLines: extractUncertainLines(jobDescription),
  };
}
