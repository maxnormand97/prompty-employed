export function ScoreRing({
  score,
  label,
  color,
}: {
  score: number;
  label: string;
  color: "violet" | "emerald";
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const strokeColor = color === "violet" ? "#7c3aed" : "#10b981";

  return (
    <div
      className="flex flex-col items-center gap-1"
      role="img"
      aria-label={`${label}: ${score} out of 100`}
    >
      <div className="relative h-28 w-28">
        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/30"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{score}</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}
