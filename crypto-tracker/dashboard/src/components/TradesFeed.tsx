import Link from "next/link";
import { RiskFlags } from "./RiskFlags";
import { fmtUsd, shortAddr, timeAgo } from "@/lib/utils";

interface TradeFeedItem {
  id: string;
  txHash: string;
  action: "BUY" | "SELL";
  chain: string;
  outputMint: string;
  outputSymbol: string | null;
  inputMint: string;
  inputSymbol: string | null;
  outputAmount: string;
  valueUsd: string | null;
  realizedPnlUsd: string | null;
  riskFlags: string[];
  riskLevel: string;
  source: string | null;
  timestamp: string;
  liquidityUsd: string | null;
  wallet: {
    address: string;
    label: string | null;
    score: number;
  };
}

interface TradesFeedProps {
  trades: TradeFeedItem[];
  showWallet?: boolean;
}

export function TradesFeed({ trades, showWallet = true }: TradesFeedProps) {
  if (!trades.length) {
    return (
      <div className="text-center py-12 text-t3">
        <p className="text-3xl mb-2">📭</p>
        <p className="text-t2">No trades yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trades.map(trade => {
        const pnl = trade.realizedPnlUsd ? Number(trade.realizedPnlUsd) : null;
        const value = trade.valueUsd ? Number(trade.valueUsd) : null;
        const liq = trade.liquidityUsd ? Number(trade.liquidityUsd) : null;
        const isBuy = trade.action === "BUY";
        const tokenMint = isBuy ? trade.outputMint : trade.inputMint;
        const tokenSymbol = isBuy ? trade.outputSymbol : trade.inputSymbol;

        return (
          <div key={trade.id} className="bg-s1 border border-b1 rounded-xl p-4 hover:border-b2 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* Action badge */}
                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  isBuy ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                }`}>
                  {isBuy ? "▲ BUY" : "▼ SELL"}
                </span>

                {/* Token */}
                <div className="min-w-0">
                  <span className="font-semibold text-t1">
                    {tokenSymbol ? `$${tokenSymbol}` : shortAddr(tokenMint)}
                  </span>
                  {value != null && (
                    <span className="text-t3 text-sm ml-2">{fmtUsd(value)}</span>
                  )}
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-4 shrink-0 text-sm">
                {pnl != null && (
                  <span className={`font-mono font-medium ${pnl >= 0 ? "text-success" : "text-danger"}`}>
                    {pnl >= 0 ? "+" : ""}{fmtUsd(pnl)}
                  </span>
                )}
                <span className="text-t3 text-xs">{timeAgo(trade.timestamp)}</span>
              </div>
            </div>

            {/* Meta row */}
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-t3">
              {showWallet && (
                <Link href={`/wallets/${trade.wallet.address}`} className="hover:text-hi transition-colors">
                  {trade.wallet.label ?? shortAddr(trade.wallet.address)}
                  <span className="ml-1 text-t3">· {trade.wallet.score.toFixed(0)}pts</span>
                </Link>
              )}
              {liq != null && (
                <span>Liq: {fmtUsd(liq)}</span>
              )}
              {trade.source && <span>{trade.source}</span>}
              <a
                href={`https://solscan.io/tx/${trade.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-hi transition-colors"
              >
                ↗ TX
              </a>
              <RiskFlags flags={trade.riskFlags} level={trade.riskLevel} compact />
            </div>
          </div>
        );
      })}
    </div>
  );
}
