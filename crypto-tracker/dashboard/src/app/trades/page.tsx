import { prisma } from "@/lib/db";
import { TradesFeed } from "@/components/TradesFeed";

export const revalidate = 30;

export default async function TradesPage() {
  const trades = await prisma.trade.findMany({
    orderBy: { timestamp: "desc" },
    take: 100,
    include: {
      wallet: { select: { address: true, label: true, score: true } },
    },
  });

  const formatted = trades.map(t => ({
    ...t,
    timestamp: t.timestamp.toISOString(),
    wallet: { ...t.wallet, score: Number(t.wallet.score) },
  }));

  const buys = trades.filter(t => t.action === "BUY").length;
  const sells = trades.filter(t => t.action === "SELL").length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-t1">Trade Feed</h1>
          <p className="text-t3 text-sm mt-1">
            {trades.length} recent trades · {buys} buys · {sells} sells
          </p>
        </div>
      </div>

      <TradesFeed trades={formatted as Parameters<typeof TradesFeed>[0]["trades"]} />
    </div>
  );
}
