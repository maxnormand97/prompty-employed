export function scoreBand(score: number): { label: string; className: string } {
  if (score >= 85) return { label: "Strong Match", className: "text-emerald-400" };
  if (score >= 70) return { label: "Good Match", className: "text-sky-400" };
  if (score >= 50) return { label: "Fair Match", className: "text-amber-400" };
  return { label: "Weak Match", className: "text-red-400" };
}
