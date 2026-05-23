import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RiskLevel, TradeAction } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const action = searchParams.get("action") as TradeAction | null;
  const minRisk = searchParams.get("minRisk") as RiskLevel | null;
  const tokenAddress = searchParams.get("token");
  const minValue = searchParams.get("minValue");

  const trades = await prisma.trade.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(tokenAddress ? { outputMint: tokenAddress } : {}),
      ...(minValue ? { valueUsd: { gte: Number(minValue) } } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: {
      wallet: {
        select: { address: true, label: true, score: true },
      },
    },
    orderBy: { timestamp: "desc" },
    take: limit + 1,
  });

  const hasMore = trades.length > limit;
  const items = (hasMore ? trades.slice(0, limit) : trades).map(t => ({
    ...t,
    wallet: { ...t.wallet, score: Number(t.wallet.score) },
  }));
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return NextResponse.json({ items, nextCursor, hasMore });
}
