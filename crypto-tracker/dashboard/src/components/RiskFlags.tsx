import { riskBg } from "@/lib/utils";

interface RiskFlagsProps {
  flags: string[];
  level?: string;
  compact?: boolean;
}

const FLAG_LABELS: Record<string, string> = {
  LOW_LIQUIDITY: "Low Liq",
  VERY_LOW_LIQUIDITY: "Very Low Liq",
  NEW_TOKEN: "New Token",
  VERY_NEW_TOKEN: "Very New",
  HIGH_HOLDER_CONCENTRATION: "Concentrated",
  KNOWN_SCAM: "Scam",
  PUMP_AND_DUMP_PATTERN: "Pump & Dump",
  WALLET_SELLING_INTO_FOLLOWERS: "Selling Into Followers",
  SUSPICIOUS_PRE_BUY_TRANSFER: "Suspicious",
  ONE_HIT_WONDER_WALLET: "One-Hit Wonder",
  HONEYPOT_SUSPECTED: "Honeypot",
  MICRO_CAP_EXTREME: "Micro Cap",
};

export function RiskFlags({ flags, level = "LOW", compact = false }: RiskFlagsProps) {
  if (!flags.length) {
    return <span className="text-xs text-success">✓ No flags</span>;
  }

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${riskBg(level)}`}>
        ⚠ {flags.length} flag{flags.length > 1 ? "s" : ""}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map(flag => (
        <span key={flag} className={`text-xs px-2 py-0.5 rounded-full ${riskBg(level)}`}>
          {FLAG_LABELS[flag] ?? flag}
        </span>
      ))}
    </div>
  );
}
