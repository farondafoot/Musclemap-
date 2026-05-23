"use client";

import Link from "next/link";
import { ScoreBadge } from "./ScoreBadge";
import { fmtUsd, fmtPct, shortAddr, timeAgo } from "@/lib/utils";

interface WalletRow {
  id: string;
  address: string;
  label: string | null;
  chain: string;
  score: number;
  status: string;
  scoreUpdatedAt: string | null;
  _count: { trades: number };
  latestScore: {
    totalRealizedPnl: string;
    winRate: string;
    tradeCount: number;
    medianRoiPct: string;
  } | null;
}

interface WalletLeaderboardProps {
  wallets: WalletRow[];
}

export function WalletLeaderboard({ wallets }: WalletLeaderboardProps) {
  if (!wallets.length) {
    return (
      <div className="text-center py-16 text-t3">
        <p className="text-4xl mb-3">👛</p>
        <p className="text-t2 mb-1">No wallets tracked yet</p>
        <p className="text-sm">Add wallets via the CLI: <code className="font-mono text-hi">npm run wallet:add &lt;address&gt;</code></p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-b1 text-t3 text-xs uppercase tracking-wide">
            <th className="pb-3 text-left font-medium w-8">#</th>
            <th className="pb-3 text-left font-medium">Wallet</th>
            <th className="pb-3 text-right font-medium">Score</th>
            <th className="pb-3 text-right font-medium">Total PnL</th>
            <th className="pb-3 text-right font-medium">Win Rate</th>
            <th className="pb-3 text-right font-medium">Median ROI</th>
            <th className="pb-3 text-right font-medium">Trades</th>
            <th className="pb-3 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-b1">
          {wallets.map((w, i) => {
            const pnl = w.latestScore ? Number(w.latestScore.totalRealizedPnl) : null;
            const winRate = w.latestScore ? Number(w.latestScore.winRate) * 100 : null;
            const roi = w.latestScore ? Number(w.latestScore.medianRoiPct) : null;

            return (
              <tr key={w.id} className="hover:bg-s2 transition-colors">
                <td className="py-3 pr-3 text-t3">{i + 1}</td>
                <td className="py-3">
                  <Link href={`/wallets/${w.address}`} className="group">
                    <div className="font-medium text-t1 group-hover:text-hi transition-colors">
                      {w.label ?? shortAddr(w.address)}
                    </div>
                    {w.label && (
                      <div className="text-xs text-t3 font-mono mt-0.5">{shortAddr(w.address)}</div>
                    )}
                  </Link>
                </td>
                <td className="py-3 text-right">
                  <ScoreBadge score={w.score} size="sm" />
                </td>
                <td className={`py-3 text-right font-mono ${pnl == null ? "text-t3" : pnl >= 0 ? "text-success" : "text-danger"}`}>
                  {pnl == null ? "—" : fmtUsd(pnl)}
                </td>
                <td className="py-3 text-right">
                  {winRate == null ? "—" : `${winRate.toFixed(0)}%`}
                </td>
                <td className={`py-3 text-right font-mono ${roi == null ? "text-t3" : roi >= 0 ? "text-success" : "text-danger"}`}>
                  {roi == null ? "—" : fmtPct(roi)}
                </td>
                <td className="py-3 text-right text-t2">{w._count.trades}</td>
                <td className="py-3 text-right text-t3 text-xs">
                  {w.scoreUpdatedAt ? timeAgo(w.scoreUpdatedAt) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
