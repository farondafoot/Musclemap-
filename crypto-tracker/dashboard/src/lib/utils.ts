export function fmtUsd(v: number | null | undefined, compact = true): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (compact) {
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

export function shortAddr(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function timeAgo(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function scoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-hi";
  if (score >= 40) return "text-warn";
  return "text-danger";
}

export function scoreBg(score: number): string {
  if (score >= 80) return "bg-success/10 text-success";
  if (score >= 60) return "bg-hi/10 text-hi";
  if (score >= 40) return "bg-warn/10 text-warn";
  return "bg-danger/10 text-danger";
}

export function riskColor(level: string): string {
  switch (level) {
    case "LOW": return "text-success";
    case "MEDIUM": return "text-warn";
    case "HIGH": return "text-orange-400";
    case "CRITICAL": return "text-danger";
    default: return "text-t2";
  }
}

export function riskBg(level: string): string {
  switch (level) {
    case "LOW": return "bg-success/10 text-success";
    case "MEDIUM": return "bg-warn/10 text-warn";
    case "HIGH": return "bg-orange-500/10 text-orange-400";
    case "CRITICAL": return "bg-danger/10 text-danger";
    default: return "bg-b1 text-t2";
  }
}
