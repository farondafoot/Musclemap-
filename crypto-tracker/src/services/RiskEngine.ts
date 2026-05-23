import { prisma } from "@/db/client";
import { TokenInfoService } from "./TokenInfoService";
import type { RiskAssessment, RiskFlag, TokenInfo } from "@/types";
import { RiskLevel, Chain, TradeAction } from "@prisma/client";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

const FLAG_WEIGHTS: Record<RiskFlag, number> = {
  LOW_LIQUIDITY: 20,
  VERY_LOW_LIQUIDITY: 40,
  NEW_TOKEN: 15,
  VERY_NEW_TOKEN: 35,
  HIGH_HOLDER_CONCENTRATION: 25,
  KNOWN_SCAM: 100,
  PUMP_AND_DUMP_PATTERN: 30,
  WALLET_SELLING_INTO_FOLLOWERS: 25,
  SUSPICIOUS_PRE_BUY_TRANSFER: 20,
  ONE_HIT_WONDER_WALLET: 15,
  HONEYPOT_SUSPECTED: 45,
  MICRO_CAP_EXTREME: 20,
};

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) return RiskLevel.CRITICAL;
  if (score >= 40) return RiskLevel.HIGH;
  if (score >= 20) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

export class RiskEngine {
  constructor(private tokenInfo: TokenInfoService) {}

  async assess(params: {
    tokenAddress: string;
    chain: Chain;
    walletId: string;
    action: TradeAction;
    liquidityUsd?: number | null;
    tokenAgeMinutes?: number | null;
  }): Promise<RiskAssessment> {
    const flags: RiskFlag[] = [];
    const details: Partial<Record<RiskFlag, string>> = {};

    // 1. Token age (cheapest — DB only)
    this.detectTokenAge(params.tokenAgeMinutes, flags, details);

    // 2. Liquidity check (provided or fetched from cache)
    let liqUsd = params.liquidityUsd;
    if (liqUsd == null) {
      const info = await this.tokenInfo.getTokenInfo(params.tokenAddress, params.chain);
      liqUsd = info?.liquidityUsd ?? null;
    }
    this.detectLiquidity(liqUsd, flags, details);

    // Short-circuit if CRITICAL so far
    const partialScore = this.computeScore(flags);
    if (partialScore >= 70) {
      return this.buildResult(flags, details);
    }

    // 3. Market cap check
    const tokenData = await this.tokenInfo.getTokenInfo(params.tokenAddress, params.chain);
    this.detectMicroCap(tokenData, flags, details);
    this.detectHolderConcentration(tokenData, flags, details);
    this.detectKnownScam(tokenData, flags, details);

    if (this.computeScore(flags) >= 70) {
      return this.buildResult(flags, details);
    }

    // 4. Behavioral patterns (DB queries)
    await this.detectPumpAndDump(params.tokenAddress, params.walletId, flags, details);
    await this.detectPreBuyTransfers(params.walletId, params.tokenAddress, params.chain, flags, details);

    if (params.action === TradeAction.SELL) {
      await this.detectSellingIntoFollowers(params.walletId, params.tokenAddress, params.chain, flags, details);
    }

    // 5. Honeypot heuristic
    await this.detectHoneypot(params.tokenAddress, flags, details);

    return this.buildResult(flags, details);
  }

  // ── Detectors ─────────────────────────────────────────────────────────────

  private detectTokenAge(
    ageMinutes: number | null | undefined,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): void {
    if (ageMinutes == null) return;
    if (ageMinutes < 5) {
      flags.push("VERY_NEW_TOKEN");
      details["VERY_NEW_TOKEN"] = `Token is only ${ageMinutes.toFixed(1)}min old`;
    } else if (ageMinutes < config.risk.maxTokenAgeMinutes) {
      flags.push("NEW_TOKEN");
      details["NEW_TOKEN"] = `Token is ${ageMinutes.toFixed(0)}min old (threshold: ${config.risk.maxTokenAgeMinutes}min)`;
    }
  }

  private detectLiquidity(
    liquidityUsd: number | null | undefined,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): void {
    if (liquidityUsd == null) return;
    if (liquidityUsd < 10_000) {
      flags.push("VERY_LOW_LIQUIDITY");
      details["VERY_LOW_LIQUIDITY"] = `Liquidity: $${fmtUsd(liquidityUsd)} (extremely low)`;
    } else if (liquidityUsd < config.risk.minLiquidityUsd) {
      flags.push("LOW_LIQUIDITY");
      details["LOW_LIQUIDITY"] = `Liquidity: $${fmtUsd(liquidityUsd)} (threshold: $${fmtUsd(config.risk.minLiquidityUsd)})`;
    }
  }

  private detectMicroCap(
    info: TokenInfo | null,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): void {
    if (!info?.marketCapUsd) return;
    if (info.marketCapUsd < 50_000) {
      flags.push("MICRO_CAP_EXTREME");
      details["MICRO_CAP_EXTREME"] = `Market cap: $${fmtUsd(info.marketCapUsd)}`;
    }
  }

  private detectHolderConcentration(
    info: TokenInfo | null,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): void {
    if (!info?.topHolderPct) return;
    if (info.topHolderPct > config.risk.maxHolderConcentration) {
      flags.push("HIGH_HOLDER_CONCENTRATION");
      details["HIGH_HOLDER_CONCENTRATION"] =
        `Top 10 wallets hold ${(info.topHolderPct * 100).toFixed(0)}% (threshold: ${(config.risk.maxHolderConcentration * 100).toFixed(0)}%)`;
    }
  }

  private detectKnownScam(
    info: TokenInfo | null,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): void {
    if (!info) return;
    // Placeholder: check against a local scam list or Birdeye security data
    // In production, integrate with GoPlus or Birdeye token security API
    const scamKeywords = ["scam", "honeypot", "rug", "fake"];
    const combined = [(info.name ?? ""), (info.symbol ?? "")].join(" ").toLowerCase();
    if (scamKeywords.some(k => combined.includes(k))) {
      flags.push("KNOWN_SCAM");
      details["KNOWN_SCAM"] = `Token name/symbol contains scam indicator: "${combined}"`;
    }
  }

  private async detectPumpAndDump(
    tokenAddress: string,
    walletId: string,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): Promise<void> {
    // If this wallet bought then sold the same token in <2 hours multiple times → P&D pattern
    const fastFlips = await prisma.trade.findMany({
      where: { walletId, outputMint: tokenAddress, holdSeconds: { lte: 7200 } },
      select: { holdSeconds: true },
    });
    if (fastFlips.length >= 3) {
      flags.push("PUMP_AND_DUMP_PATTERN");
      details["PUMP_AND_DUMP_PATTERN"] =
        `Wallet has ${fastFlips.length} fast-flips (<2h) on this token`;
    }
  }

  private async detectPreBuyTransfers(
    walletId: string,
    tokenAddress: string,
    chain: Chain,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): Promise<void> {
    // Look for SOL transfers TO this wallet within 5 minutes before a BUY on this token
    const recentBuy = await prisma.trade.findFirst({
      where: { walletId, outputMint: tokenAddress, action: TradeAction.BUY },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    if (!recentBuy) return;

    const fiveMinBefore = new Date(recentBuy.timestamp.getTime() - 5 * 60_000);

    // Check if this wallet received an unusual SOL transfer just before buying
    // (This is a simplified heuristic; a production system would parse native SOL transfers)
    const suspicious = await prisma.trade.count({
      where: {
        walletId,
        timestamp: { gte: fiveMinBefore, lte: recentBuy.timestamp },
        inputMint: "So11111111111111111111111111111111111111112",
        action: TradeAction.BUY,
      },
    });

    if (suspicious > 1) {
      flags.push("SUSPICIOUS_PRE_BUY_TRANSFER");
      details["SUSPICIOUS_PRE_BUY_TRANSFER"] = "Multiple transactions detected before this buy";
    }
  }

  private async detectSellingIntoFollowers(
    walletId: string,
    tokenAddress: string,
    chain: Chain,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): Promise<void> {
    // If this wallet has triggered alerts on this token for other tracked wallets recently,
    // and now it's selling, flag it.
    const recentAlertsOnToken = await prisma.alert.count({
      where: {
        tokenAddress,
        tradeAction: TradeAction.BUY,
        createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        walletId: { not: walletId },
      },
    });

    if (recentAlertsOnToken >= 2) {
      flags.push("WALLET_SELLING_INTO_FOLLOWERS");
      details["WALLET_SELLING_INTO_FOLLOWERS"] =
        `${recentAlertsOnToken} buy alerts sent on this token in the last 24h; wallet is now selling`;
    }
  }

  private async detectHoneypot(
    tokenAddress: string,
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): Promise<void> {
    // Heuristic: if we see many BUY trades for a token but very few SELL trades
    // across ALL tracked wallets → possible honeypot (can't sell)
    const buys = await prisma.trade.count({ where: { outputMint: tokenAddress, action: TradeAction.BUY } });
    const sells = await prisma.trade.count({ where: { inputMint: tokenAddress, action: TradeAction.SELL } });

    if (buys >= 5 && sells === 0) {
      flags.push("HONEYPOT_SUSPECTED");
      details["HONEYPOT_SUSPECTED"] = `${buys} tracked buys, 0 sells — possible honeypot`;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private computeScore(flags: RiskFlag[]): number {
    const raw = flags.reduce((sum, f) => sum + (FLAG_WEIGHTS[f] ?? 0), 0);
    return Math.min(100, raw);
  }

  private buildResult(
    flags: RiskFlag[],
    details: Partial<Record<RiskFlag, string>>
  ): RiskAssessment {
    const score = this.computeScore(flags);
    return {
      flags,
      score,
      level: riskLevelFromScore(score),
      details: details as Record<RiskFlag, string>,
    };
  }
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}
