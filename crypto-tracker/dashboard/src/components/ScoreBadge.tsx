import { scoreBg } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const sizeClass = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5 font-semibold",
  }[size];

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${scoreBg(score)}`}>
      {score.toFixed(0)}
    </span>
  );
}

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size / 2) * 0.8;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  const colorMap =
    score >= 80 ? "#30c48a" :
    score >= 60 ? "#5b8def" :
    score >= 40 ? "#f0a030" : "#e05050";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#2a2a30" strokeWidth={4}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={colorMap}
        strokeWidth={4}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x={size / 2} y={size / 2 + 1}
        textAnchor="middle" dominantBaseline="central"
        fill={colorMap} fontSize={size * 0.26} fontWeight="700"
        style={{ transform: `rotate(90deg) translate(0, -${size / 2}px)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {score.toFixed(0)}
      </text>
    </svg>
  );
}
