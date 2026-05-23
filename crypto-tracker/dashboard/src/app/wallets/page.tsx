import { prisma } from "@/lib/db";
import { WalletLeaderboard } from "@/components/WalletLeaderboard";
import { WalletStatus } from "@prisma/client";

export const revalidate = 30;

export default async function WalletsPage() {
  const wallets = await prisma.trackedWallet.findMany({
    where: { status: WalletStatus.ACTIVE },
    include: {
      _count: { select: { trades: true } },
      scoreHistory: {
        orderBy: { calculatedAt: "desc" },
        take: 1,
        select: { totalRealizedPnl: true, winRate: true, tradeCount: true, medianRoiPct: true },
      },
    },
    orderBy: { score: "desc" },
    take: 200,
  });

  const formatted = wallets.map(w => ({
    ...w,
    score: Number(w.score),
    scoreUpdatedAt: w.scoreUpdatedAt?.toISOString() ?? null,
    latestScore: w.scoreHistory[0] ?? null,
    scoreHistory: undefined,
  }));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-t1">Wallet Leaderboard</h1>
          <p className="text-t3 text-sm mt-1">{wallets.length} tracked wallets, sorted by score</p>
        </div>
      </div>

      <div className="bg-s1 border border-b1 rounded-xl p-6">
        <WalletLeaderboard wallets={formatted as Parameters<typeof WalletLeaderboard>[0]["wallets"]} />
      </div>
    </div>
  );
}
