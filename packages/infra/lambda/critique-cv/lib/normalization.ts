import { RoleNormalization } from "./types";

const SENIORITY_PATTERNS: Array<{ value: string; pattern: RegExp }> = [
  { value: "PRINCIPAL", pattern: /\bprincipal\b/i },
  { value: "STAFF", pattern: /\bstaff\b/i },
  { value: "LEAD", pattern: /\blead\b/i },
  { value: "SENIOR", pattern: /\bsenior\b/i },
  { value: "MANAGER", pattern: /\b(manager|head of|director|vp)\b/i },
  { value: "MID", pattern: /\b(mid|intermediate)\b/i },
  { value: "JUNIOR", pattern: /\bjunior|entry[- ]level\b/i },
];

const STACK_KEYWORDS = [
  "typescript",
  "javascript",
  "python",
  "java",
  "go",
  "rust",
  "node",
  "react",
  "next.js",
  "nextjs",
  "aws",
  "gcp",
  "azure",
  "sql",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "docker",
  "kubernetes",
  "microservices",
  "terraform",
  "graphql",
  "rest",
  "ci/cd",
  "linux",
  "c",
  "c++",
  "embedded",
];

const DOMAIN_KEYWORDS = [
  "saas",
  "fintech",
  "medtech",
  "cybersecurity",
  "embedded",
  "hft",
  "healthcare",
  "payments",
  "e-commerce",
  "adtech",
  "gaming",
  "b2b",
];

const COMPLIANCE_KEYWORDS = ["hipaa", "pci-dss", "pci", "soc2", "sox", "gdpr", "iso 27001", "fedramp"];

const SCALE_KEYWORDS = [
  "microservices",
  "distributed systems",
  "high availability",
  "large public apis",
  "public api",
  "low latency",
  "high throughput",
  "multi-tenant",
  "global scale",
  "millions of users",
];

const STABILITY_SENSITIVE_KEYWORDS = [
  "fast-paced",
  "high growth",
  "ownership",
  "long-term",
  "stability",
  "execution",
  "high-agency",
];

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((s) => s.trim()).filter(Boolean)));
}

function extractMatches(text: string, dictionary: string[]): string[] {
  const lower = text.toLowerCase();
  return dictionary.filter((term) => lower.includes(term.toLowerCase()));
}

function inferSeniority(text: string): string {
  for (const candidate of SENIORITY_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return candidate.value;
    }
  }
  return "UNSPECIFIED";
}

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
  const seniority = inferSeniority(jobDescription);
  const requiredYears = extractRequiredYears(jobDescription);
  const mandatoryStack = dedupe(extractMatches(jobDescription, STACK_KEYWORDS));
  const complianceSignals = dedupe(extractMatches(jobDescription, COMPLIANCE_KEYWORDS));
  const domainSignals = dedupe(extractMatches(jobDescription, DOMAIN_KEYWORDS));
  const scaleSignals = dedupe(extractMatches(jobDescription, SCALE_KEYWORDS));
  const stabilitySensitiveWording = dedupe(
    extractMatches(jobDescription, STABILITY_SENSITIVE_KEYWORDS)
  );
  const uncertainLines = extractUncertainLines(jobDescription);
  const degreeRequirement = extractDegreeRequirement(jobDescription);

  return {
    rawJobDescription: jobDescription,
    seniority,
    requiredYears,
    primaryDomain: domainSignals[0],
    mandatoryStack,
    complianceSignals,
    domainSignals,
    scaleSignals,
    stabilitySensitiveWording,
    degreeRequirement,
    uncertainLines,
  };
}
