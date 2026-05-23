import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AlertType, RiskLevel } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const type = searchParams.get("type") as AlertType | null;
  const minRisk = searchParams.get("minRisk") as RiskLevel | null;

  const riskOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const riskFilter = minRisk
    ? { riskLevel: { in: riskOrder.slice(riskOrder.indexOf(minRisk)) as RiskLevel[] } }
    : {};

  const alerts = await prisma.alert.findMany({
    where: {
      ...(type ? { type } : {}),
      ...riskFilter,
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: {
      wallet: { select: { address: true, label: true, score: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore = alerts.length > limit;
  const items = hasMore ? alerts.slice(0, limit) : alerts;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return NextResponse.json({ items, nextCursor, hasMore });
}
