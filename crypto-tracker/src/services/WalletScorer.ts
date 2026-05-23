import { prisma } from "@/db/client";
import type { WalletMetrics, ScoreComponents, ScorePenalties } from "@/types";
import { logger } from "@/utils/logger";

// ── Weights (must sum to 1.0) ─────────────────────────────────────────────────

const WEIGHTS = {
  pnl: 0.25,
  winRate: 0.20,
  roi: 0.20,
  holdTime: 0.10,
  drawdown: 0.10,
  consistency: 0.10,
  liquidity: 0.05,
} as const;

// ── Sub-scorer functions ──────────────────────────────────────────────────────

/** Log-scale PnL score: $0→0, $1k→19, $10k→53, $100k→92, $1M→100 */
function scorePnl(totalRealizedPnl: number): number {
  if (totalRealizedPnl <= 0) return 0;
  return Math.min(100, Math.max(0, Math.log10(totalRealizedPnl / 500 + 1) * 40));
}

/**
 * Win rate score, normalized by trade count.
 * Requires ≥10 trades for full weight; below that it's scaled by sqrt(n/10).
 */
function scoreWinRate(winRate: number, tradeCount: number): number {
  if (tradeCount === 0) return 0;
  const rawScore = Math.max(0, (winRate - 0.35) / 0.65) * 100;
  const confidence = Math.min(1, Math.sqrt(tradeCount / 10));
  return rawScore * confidence;
}

/** Median ROI per trade: 0%→0, 20%→25, 50%→50, 100%→70, 500%→100 */
function scoreMedianRoi(medianRoiPct: number): number {
  if (medianRoiPct <= 0) return 0;
  // log1p curve: score = 100 * log1p(roi/20) / log1p(25)
  return Math.min(100, (Math.log1p(medianRoiPct / 20) / Math.log1p(25)) * 100);
}

/**
 * Hold time score: prefer 1h-14d range.
 * <30min (degen flip) = 10, 30min-1h = 30, 1h-24h = 70, 1d-14d = 100, >14d = 70, >90d = 30
 */
function scoreHoldTime(medianHoldHours: number): number {
  if (medianHoldHours < 0.5) return 10;
  if (medianHoldHours < 1) return 30;
  if (medianHoldHours < 24) return 70;
  if (medianHoldHours < 24 * 14) return 100;
  if (medianHoldHours < 24 * 90) return 70;
  return 30;
}

/** Max drawdown: 0% drawdown = 100, 50% = 50, 100% = 0 */
function scoreDrawdown(maxDrawdownPct: number): number {
  return Math.max(0, 100 - maxDrawdownPct);
}

/**
 * Consistency: measures how evenly distributed performance is across 7d/30d/90d.
 * All three positive → 100. Two positive → 65. One positive → 30. None → 0.
 */
function scoreConsistency(
  pnl7d: number | null,
  pnl30d: number | null,
  pnl90d: number | null,
  winRate7d: number | null,
  winRate30d: number | null,
  winRate90d: number | null
): number {
  const positiveWindows = [
    pnl7d != null && pnl7d > 0,
    pnl30d != null && pnl30d > 0,
    pnl90d != null && pnl90d > 0,
  ].filter(Boolean).length;

  const positiveWinRates = [
    winRate7d != null && winRate7d > 0.5,
    winRate30d != null && winRate30d > 0.5,
    winRate90d != null && winRate90d > 0.5,
  ].filter(Boolean).length;

  const windowScore = [100, 65, 30, 0][3 - positiveWindows] ?? 0;
  const wrScore = [100, 65, 30, 0][3 - positiveWinRates] ?? 0;

  return (windowScore + wrScore) / 2;
}

/**
 * Token liquidity quality: average liquidity of traded tokens.
 * <$10k = 0, $50k = 30, $200k = 60, $1M = 80, $5M+ = 100
 */
function scoreLiquidity(avgLiquidityUsd: number): number {
  if (avgLiquidityUsd < 10_000) return 0;
  if (avgLiquidityUsd < 50_000) return 30;
  if (avgLiquidityUsd < 200_000) return 60;
  if (avgLiquidityUsd < 1_000_000) return 80;
  return 100;
}

// ── Main scorer ───────────────────────────────────────────────────────────────

export class WalletScorer {
  async scoreWallet(walletId: string): Promise<number> {
    const metrics = await this.computeMetrics(walletId);
    const avgLiquidityUsd = await this.computeAvgLiquidity(walletId);

    const components: ScoreComponents = {
      realizedPnlScore: scorePnl(metrics.totalRealizedPnl),
      winRateScore: scoreWinRate(metrics.winRate, metrics.tradeCount),
      medianRoiScore: scoreMedianRoi(metrics.medianRoiPct),
      holdTimeScore: scoreHoldTime(metrics.avgHoldTimeHours),
      drawdownScore: scoreDrawdown(metrics.maxDrawdownPct),
      consistencyScore: scoreConsistency(
        metrics.pnl7d, metrics.pnl30d, metrics.pnl90d,
        metrics.winRate7d, metrics.winRate30d, metrics.winRate90d
      ),
      tradeQualityScore: scoreLiquidity(avgLiquidityUsd),
    };

    const penalties = this.computePenalties(metrics, avgLiquidityUsd);

    const weightedScore =
      components.realizedPnlScore * WEIGHTS.pnl +
      components.winRateScore * WEIGHTS.winRate +
      components.medianRoiScore * WEIGHTS.roi +
      components.holdTimeScore * WEIGHTS.holdTime +
      components.drawdownScore * WEIGHTS.drawdown +
      components.consistencyScore * WEIGHTS.consistency +
      components.tradeQualityScore * WEIGHTS.liquidity;

    const totalPenalty =
      (penalties.oneHitWonder ?? 0) +
      (penalties.illiquidTrader ?? 0) +
      (penalties.inactive ?? 0) +
      (penalties.tooFewTrades ?? 0);

    const finalScore = Math.max(0, Math.min(100, weightedScore - totalPenalty));

    // Persist the score snapshot
    await prisma.$transaction([
      prisma.walletScore.create({
        data: {
          walletId,
          score: finalScore,
          pnlScore: components.realizedPnlScore,
          winRateScore: components.winRateScore,
          roiScore: components.medianRoiScore,
          holdTimeScore: components.holdTimeScore,
          drawdownScore: components.drawdownScore,
          consistencyScore: components.consistencyScore,
          liquidityScore: components.tradeQualityScore,
          penaltyOneHitWonder: penalties.oneHitWonder ?? 0,
          penaltyIlliquid: penalties.illiquidTrader ?? 0,
          penaltyInactive: penalties.inactive ?? 0,
          tradeCount: metrics.tradeCount,
          winCount: metrics.profitableTradeCount,
          totalRealizedPnl: metrics.totalRealizedPnl,
          winRate: metrics.winRate,
          medianRoiPct: metrics.medianRoiPct,
          medianHoldHours: metrics.avgHoldTimeHours,
          maxDrawdownPct: metrics.maxDrawdownPct,
          pnl7d: metrics.pnl7d,
          pnl30d: metrics.pnl30d,
          pnl90d: metrics.pnl90d,
          winRate7d: metrics.winRate7d,
          winRate30d: metrics.winRate30d,
          winRate90d: metrics.winRate90d,
        },
      }),
      prisma.trackedWallet.update({
        where: { id: walletId },
        data: { score: finalScore, scoreUpdatedAt: new Date() },
      }),
    ]);

    logger.debug("WalletScorer: scored wallet", { walletId, score: finalScore, tradeCount: metrics.tradeCount });
    return finalScore;
  }

  // ── Metrics computation ───────────────────────────────────────────────────

  private async computeMetrics(walletId: string): Promise<WalletMetrics> {
    const trades = await prisma.trade.findMany({
      where: { walletId, isPaired: true },
      select: {
        realizedPnlUsd: true,
        roiPercent: true,
        holdSeconds: true,
        timestamp: true,
        isWin: true,
      },
      orderBy: { timestamp: "asc" },
    });

    const now = Date.now();
    const d7 = now - 7 * 86400_000;
    const d30 = now - 30 * 86400_000;
    const d90 = now - 90 * 86400_000;

    const pnlValues: number[] = [];
    const roiValues: number[] = [];
    const holdHours: number[] = [];
    let wins = 0;

    const period = (cutoff: number) => {
      const pts = trades.filter(t => t.timestamp.getTime() >= cutoff);
      if (!pts.length) return { pnl: null, winRate: null };
      const pnl = pts.reduce((s, t) => s + Number(t.realizedPnlUsd ?? 0), 0);
      const w = pts.filter(t => t.isWin).length;
      return { pnl, winRate: w / pts.length };
    };

    for (const t of trades) {
      const pnl = Number(t.realizedPnlUsd ?? 0);
      const roi = Number(t.roiPercent ?? 0);
      const hold = (t.holdSeconds ?? 0) / 3600;

      pnlValues.push(pnl);
      roiValues.push(roi);
      holdHours.push(hold);
      if (t.isWin) wins++;
    }

    const totalPnl = pnlValues.reduce((s, v) => s + v, 0);

    // Max drawdown from cumulative PnL curve
    let peak = 0;
    let cumPnl = 0;
    let maxDD = 0;
    for (const p of pnlValues) {
      cumPnl += p;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }

    const p7 = period(d7);
    const p30 = period(d30);
    const p90 = period(d90);

    return {
      tradeCount: trades.length,
      profitableTradeCount: wins,
      winRate: trades.length > 0 ? wins / trades.length : 0,
      totalRealizedPnl: totalPnl,
      medianRoiPct: median(roiValues),
      avgHoldTimeHours: median(holdHours),
      maxDrawdownPct: maxDD,
      pnl7d: p7.pnl,
      pnl30d: p30.pnl,
      pnl90d: p90.pnl,
      winRate7d: p7.winRate,
      winRate30d: p30.winRate,
      winRate90d: p90.winRate,
    };
  }

  private async computeAvgLiquidity(walletId: string): Promise<number> {
    const trades = await prisma.trade.findMany({
      where: { walletId, liquidityUsd: { not: null } },
      select: { liquidityUsd: true },
      take: 100,
      orderBy: { timestamp: "desc" },
    });

    if (!trades.length) return 0;
    const vals = trades.map(t => Number(t.liquidityUsd));
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  private computePenalties(metrics: WalletMetrics, avgLiquidityUsd: number): ScorePenalties {
    const penalties: ScorePenalties = {};

    // One-hit-wonder: if trade count is low and PnL is very high
    if (metrics.tradeCount < 5 && metrics.totalRealizedPnl > 5_000) {
      penalties.oneHitWonder = 20;
    }

    // Illiquid trader: avg token liquidity < $50k
    if (avgLiquidityUsd > 0 && avgLiquidityUsd < 50_000) {
      penalties.illiquidTrader = 15;
    }

    // Inactive: no trades in 30 days
    if (metrics.pnl30d === null) {
      penalties.inactive = 10;
    }

    // Too few trades: cap score implicitly (score is based on 0 wins/losses)
    if (metrics.tradeCount < 5) {
      penalties.tooFewTrades = 15;
    }

    return penalties;
  }
}

// ── Math utils ────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : ((sorted[mid - 1]! + sorted[mid]!) / 2);
}
