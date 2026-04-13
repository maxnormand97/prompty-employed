import { CritiqueResult, GapAdvice } from "./types";
import { log } from "./log";

/**
 * Parse and validate the JSON critique response from Claude.
 * Validates both the top-level shape and the element shapes within arrays.
 */
export function parseCritiqueResponse(raw: string): CritiqueResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log("error", "Bedrock response was not valid JSON", { rawResponse: raw });
    throw new Error(`Bedrock response was not valid JSON (length=${raw.length})`);
  }

  const result = parsed as Record<string, unknown>;

  const fitScore = Number(result.fitScore);
  const likelihoodScore = Number(result.likelihoodScore);

  if (
    typeof result.critiqueNotes !== "string" ||
    !Number.isInteger(fitScore) ||
    fitScore < 0 ||
    fitScore > 100 ||
    typeof result.fitRationale !== "string" ||
    !Number.isInteger(likelihoodScore) ||
    likelihoodScore < 0 ||
    likelihoodScore > 100 ||
    typeof result.likelihoodRationale !== "string" ||
    !Array.isArray(result.suggestedImprovements) ||
    !Array.isArray(result.gapAnalysis)
  ) {
    throw new Error("Bedrock response failed schema validation");
  }

  if (!result.suggestedImprovements.every((item: unknown) => typeof item === "string")) {
    throw new Error(
      "Bedrock response failed schema validation: suggestedImprovements must be an array of strings"
    );
  }

  const validPriorities = new Set(["HIGH", "MEDIUM", "LOW"]);
  if (
    !result.gapAnalysis.every((item: unknown) => {
      if (typeof item !== "object" || item === null) return false;
      const g = item as Record<string, unknown>;
      return (
        typeof g.gap === "string" &&
        g.gap.trim() !== "" &&
        typeof g.advice === "string" &&
        g.advice.trim() !== "" &&
        typeof g.priority === "string" &&
        validPriorities.has(g.priority)
      );
    })
  ) {
    throw new Error(
      "Bedrock response failed schema validation: gapAnalysis items must have non-empty gap/advice strings and priority in {HIGH, MEDIUM, LOW}"
    );
  }

  return {
    critiqueNotes: result.critiqueNotes as string,
    fitScore,
    fitRationale: result.fitRationale as string,
    likelihoodScore,
    likelihoodRationale: result.likelihoodRationale as string,
    suggestedImprovements: result.suggestedImprovements as string[],
    gapAnalysis: result.gapAnalysis as GapAdvice[],
  };
}
