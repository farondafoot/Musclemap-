import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TradeAction } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const action = searchParams.get("action") as TradeAction | null;

  const wallet = await prisma.trackedWallet.findFirst({
    where: { address: params.address },
    select: { id: true },
  });

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const trades = await prisma.trade.findMany({
    where: {
      walletId: wallet.id,
      ...(action ? { action } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit + 1,
  });

  const hasMore = trades.length > limit;
  const items = hasMore ? trades.slice(0, limit) : trades;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return NextResponse.json({ items, nextCursor, hasMore });
}
