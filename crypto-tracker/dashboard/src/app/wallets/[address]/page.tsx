import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ScoreRing, ScoreBadge } from "@/components/ScoreBadge";
import { TradesFeed } from "@/components/TradesFeed";
import { RiskFlags } from "@/components/RiskFlags";
import { fmtUsd, fmtPct, shortAddr, timeAgo } from "@/lib/utils";

export const revalidate = 30;

interface Props {
  params: { address: string };
}

export default async function WalletDetailPage({ params }: Props) {
  const wallet = await prisma.trackedWallet.findFirst({
    where: { address: params.address },
    include: {
      _count: { select: { trades: true, alerts: true } },
      scoreHistory: {
        orderBy: { calculatedAt: "desc" },
        take: 1,
      },
      trades: {
        orderBy: { timestamp: "desc" },
        take: 30,
        include: {
          wallet: { select: { address: true, label: true, score: true } },
        },
      },
      alerts: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          riskLevel: true,
          tokenSymbol: true,
          tradeAction: true,
          tradeValueUsd: true,
          walletScore: true,
          riskFlags: true,
          createdAt: true,
          sent: true,
        },
      },
    },
  });

  if (!wallet) notFound();

  const score = Number(wallet.score);
  const ls = wallet.scoreHistory[0];

  const tradeFeed = wallet.trades.map(t => ({
    ...t,
    timestamp: t.timestamp.toISOString(),
    wallet: { address: wallet.address, label: wallet.label, score },
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-6">
        <ScoreRing score={score} size={80} />

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-t1">
              {wallet.label ?? shortAddr(wallet.address)}
            </h1>
            <ScoreBadge score={score} size="md" />
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              wallet.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-b1 text-t3"
            }`}>
              {wallet.status}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs text-t3 font-mono">{wallet.address}</code>
            <a
              href={`https://solscan.io/account/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-hi hover:underline"
            >
              ↗ Solscan
            </a>
          </div>

          {wallet.source && (
            <p className="text-xs text-t3 mt-1">Source: {wallet.source}</p>
          )}
        </div>
      </div>

      {/* Score breakdown */}
      {ls && (
        <section>
          <h2 className="text-base font-semibold text-t1 mb-3">Score Breakdown</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total PnL", value: fmtUsd(Number(ls.totalRealizedPnl)), highlight: Number(ls.totalRealizedPnl) >= 0 },
              { label: "Win Rate", value: `${(Number(ls.winRate) * 100).toFixed(0)}%` },
              { label: "Median ROI", value: fmtPct(Number(ls.medianRoiPct)) },
              { label: "Trade Count", value: ls.tradeCount.toString() },
            ].map(metric => (
              <div key={metric.label} className="bg-s1 border border-b1 rounded-xl p-4">
                <p className="text-xs text-t3 uppercase tracking-wide mb-1">{metric.label}</p>
                <p className={`text-xl font-semibold ${
                  "highlight" in metric
                    ? metric.highlight ? "text-success" : "text-danger"
                    : "text-t1"
                }`}>
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

          {/* Component score bars */}
          <div className="mt-3 bg-s1 border border-b1 rounded-xl p-5">
            <h3 className="text-sm text-t2 mb-4">Component Scores</h3>
            <div className="space-y-3">
              {[
                { label: "PnL", score: Number(ls.pnlScore), weight: 25 },
                { label: "Win Rate", score: Number(ls.winRateScore), weight: 20 },
                { label: "ROI", score: Number(ls.roiScore), weight: 20 },
                { label: "Drawdown", score: Number(ls.drawdownScore), weight: 10 },
                { label: "Consistency", score: Number(ls.consistencyScore), weight: 10 },
                { label: "Hold Time", score: Number(ls.holdTimeScore), weight: 10 },
                { label: "Liquidity", score: Number(ls.liquidityScore), weight: 5 },
              ].map(c => (
                <div key={c.label} className="flex items-center gap-3">
                  <span className="text-xs text-t3 w-20 shrink-0">{c.label}</span>
                  <div className="flex-1 bg-b1 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-hi transition-all"
                      style={{ width: `${c.score}%` }}
                    />
                  </div>
                  <span className="text-xs text-t2 w-8 text-right">{c.score.toFixed(0)}</span>
                  <span className="text-xs text-t3 w-12 text-right">×{c.weight}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Trades */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-t1">
            Recent Trades <span className="text-t3 font-normal">({wallet._count.trades} total)</span>
          </h2>
        </div>
        <TradesFeed
          trades={tradeFeed as Parameters<typeof TradesFeed>[0]["trades"]}
          showWallet={false}
        />
      </section>

      {/* Recent Alerts */}
      {wallet.alerts.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-t1 mb-3">Recent Alerts</h2>
          <div className="space-y-2">
            {wallet.alerts.map(alert => (
              <div key={alert.id} className="bg-s1 border border-b1 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      alert.sent ? "bg-success/10 text-success" : "bg-b1 text-t3"
                    }`}>
                      {alert.sent ? "✓ Sent" : "Not sent"}
                    </span>
                    {alert.tradeAction && (
                      <span className={`text-xs font-medium ${
                        alert.tradeAction === "BUY" ? "text-success" : "text-danger"
                      }`}>
                        {alert.tradeAction}
                      </span>
                    )}
                    {alert.tokenSymbol && (
                      <span className="text-sm font-medium text-t1">${alert.tokenSymbol}</span>
                    )}
                    {alert.tradeValueUsd && (
                      <span className="text-sm text-t2">{fmtUsd(Number(alert.tradeValueUsd))}</span>
                    )}
                  </div>
                  <span className="text-xs text-t3">{timeAgo(alert.createdAt)}</span>
                </div>
                {alert.riskFlags.length > 0 && (
                  <div className="mt-2">
                    <RiskFlags flags={alert.riskFlags} level={alert.riskLevel} compact />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
