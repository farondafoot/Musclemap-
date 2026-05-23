import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Chain, WalletStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get("chain") as Chain | null;
  const sortBy = searchParams.get("sort") ?? "score";
  const status = (searchParams.get("status") as WalletStatus | null) ?? WalletStatus.ACTIVE;
  const limit = Math.min(200, parseInt(searchParams.get("limit") ?? "100"));

  const orderBy: Record<string, "asc" | "desc"> = {};
  if (["score", "createdAt", "scoreUpdatedAt"].includes(sortBy)) {
    orderBy[sortBy] = "desc";
  } else {
    orderBy["score"] = "desc";
  }

  const wallets = await prisma.trackedWallet.findMany({
    where: {
      status,
      ...(chain ? { chain } : {}),
    },
    include: {
      _count: { select: { trades: true } },
      scoreHistory: {
        orderBy: { calculatedAt: "desc" },
        take: 1,
        select: {
          totalRealizedPnl: true,
          winRate: true,
          tradeCount: true,
          medianRoiPct: true,
        },
      },
    },
    orderBy,
    take: limit,
  });

  return NextResponse.json(
    wallets.map(w => ({
      ...w,
      score: Number(w.score),
      latestScore: w.scoreHistory[0] ?? null,
      scoreHistory: undefined,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, label, source, notes, chain } = body;

  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const wallet = await prisma.trackedWallet.upsert({
    where: { address_chain: { address, chain: (chain as Chain) ?? Chain.SOLANA } },
    create: {
      address,
      chain: (chain as Chain) ?? Chain.SOLANA,
      label: label ?? null,
      source: source ?? "dashboard",
      notes: notes ?? null,
    },
    update: {
      status: WalletStatus.ACTIVE,
      label: label ?? undefined,
    },
  });

  return NextResponse.json(wallet, { status: 201 });
}
