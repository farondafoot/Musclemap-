import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Chain, WalletStatus } from "@prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: { address: string } }
) {
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
        take: 20,
        select: {
          id: true,
          txHash: true,
          action: true,
          chain: true,
          outputMint: true,
          outputSymbol: true,
          inputMint: true,
          inputSymbol: true,
          outputAmount: true,
          valueUsd: true,
          realizedPnlUsd: true,
          riskFlags: true,
          riskLevel: true,
          source: true,
          timestamp: true,
          liquidityUsd: true,
          marketCapUsd: true,
          tokenAgeMinutes: true,
        },
      },
    },
  });

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...wallet,
    latestScore: wallet.scoreHistory[0] ?? null,
    scoreHistory: undefined,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  const body = await request.json();
  const { label, notes, status } = body;

  const wallet = await prisma.trackedWallet.findFirst({
    where: { address: params.address },
  });

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const updated = await prisma.trackedWallet.update({
    where: { id: wallet.id },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(status ? { status: status as WalletStatus } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { address: string } }
) {
  const wallet = await prisma.trackedWallet.findFirst({
    where: { address: params.address },
  });

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  await prisma.trackedWallet.update({
    where: { id: wallet.id },
    data: { status: WalletStatus.ARCHIVED },
  });

  return NextResponse.json({ ok: true });
}
