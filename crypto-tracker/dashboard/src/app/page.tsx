import { prisma } from "@/lib/db";
import { WalletLeaderboard } from "@/components/WalletLeaderboard";
import { TradesFeed } from "@/components/TradesFeed";
import { fmtUsd, timeAgo } from "@/lib/utils";
import { WalletStatus } from "@prisma/client";

export const revalidate = 30;

async function getStats() {
  const [walletCount, tradeCount, alertCount, topWallets, recentTrades, recentAlerts] =
    await Promise.all([
      prisma.trackedWallet.count({ where: { status: WalletStatus.ACTIVE } }),
      prisma.trade.count(),
      prisma.alert.count({ where: { sent: true } }),
      prisma.trackedWallet.findMany({
        where: { status: WalletStatus.ACTIVE },
        orderBy: { score: "desc" },
        take: 5,
        include: {
          _count: { select: { trades: true } },
          scoreHistory: {
            orderBy: { calculatedAt: "desc" },
            take: 1,
            select: { totalRealizedPnl: true, winRate: true, tradeCount: true, medianRoiPct: true },
          },
        },
      }),
      prisma.trade.findMany({
        orderBy: { timestamp: "desc" },
        take: 10,
        include: {
          wallet: { select: { address: true, label: true, score: true } },
        },
      }),
      prisma.alert.findMany({
        where: { sent: true },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { wallet: { select: { address: true, label: true } } },
      }),
    ]);

  return { walletCount, tradeCount, alertCount, topWallets, recentTrades, recentAlerts };
}

export default async function DashboardPage() {
  const { walletCount, tradeCount, alertCount, topWallets, recentTrades } = await getStats();

  const formattedWallets = topWallets.map(w => ({
    ...w,
    score: Number(w.score),
    scoreUpdatedAt: w.scoreUpdatedAt?.toISOString() ?? null,
    latestScore: w.scoreHistory[0] ?? null,
    scoreHistory: undefined,
  }));

  const formattedTrades = recentTrades.map(t => ({
    ...t,
    timestamp: t.timestamp.toISOString(),
    wallet: { ...t.wallet, score: Number(t.wallet.score) },
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-t1">Overview</h1>
        <p className="text-t3 text-sm mt-1">Wallet intelligence dashboard — alert-only mode</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tracked Wallets", value: walletCount, color: "text-hi" },
          { label: "Total Trades", value: tradeCount, color: "text-success" },
          { label: "Alerts Sent", value: alertCount, color: "text-warn" },
        ].map(stat => (
          <div key={stat.label} className="bg-s1 border border-b1 rounded-xl p-5">
            <p className="text-t3 text-xs uppercase tracking-wider mb-2">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Top Wallets */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-t1">Top Wallets</h2>
          <a href="/wallets" className="text-sm text-hi hover:underline">View all →</a>
        </div>
        <div className="bg-s1 border border-b1 rounded-xl p-5">
          <WalletLeaderboard wallets={formattedWallets as Parameters<typeof WalletLeaderboard>[0]["wallets"]} />
        </div>
      </section>

      {/* Recent Trades */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-t1">Recent Trades</h2>
          <a href="/trades" className="text-sm text-hi hover:underline">View all →</a>
        </div>
        <TradesFeed trades={formattedTrades as Parameters<typeof TradesFeed>[0]["trades"]} />
      </section>
    </div>
  );
}
