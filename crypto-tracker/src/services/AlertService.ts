import { prisma } from "@/db/client";
import { WalletScorer } from "./WalletScorer";
import { RiskEngine } from "./RiskEngine";
import { TelegramService } from "./TelegramService";
import type { TradeAlertPayload } from "@/types";
import { AlertType, RiskLevel, TradeAction } from "@prisma/client";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

export class AlertService {
  constructor(
    private scorer: WalletScorer,
    private riskEngine: RiskEngine,
    private telegram: TelegramService
  ) {}

  /**
   * Called after a new Trade is persisted. Runs scoring, risk assessment,
   * creates an Alert record, and sends a Telegram message if thresholds are met.
   */
  async handleNewTrade(tradeId: string): Promise<void> {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { wallet: true },
    });

    if (!trade) return;

    // Update wallet score
    const score = await this.scorer.scoreWallet(trade.walletId);

    // Run risk assessment
    const risk = await this.riskEngine.assess({
      tokenAddress: trade.outputMint,
      chain: trade.chain,
      walletId: trade.walletId,
      action: trade.action,
      liquidityUsd: trade.liquidityUsd ? Number(trade.liquidityUsd) : null,
      tokenAgeMinutes: trade.tokenAgeMinutes ? Number(trade.tokenAgeMinutes) : null,
    });

    // Persist risk flags back to the trade
    await prisma.trade.update({
      where: { id: tradeId },
      data: {
        riskFlags: risk.flags,
        riskScore: risk.score,
        riskLevel: risk.level,
      },
    });

    // Check alert thresholds
    const tradeValueUsd = trade.valueUsd ? Number(trade.valueUsd) : 0;
    const shouldAlert =
      score >= config.alertMinScore &&
      tradeValueUsd >= config.alertMinTradeUsd &&
      risk.level !== RiskLevel.CRITICAL; // Never alert on critical risk

    // Fetch latest wallet score metrics for payload
    const latestScore = await prisma.walletScore.findFirst({
      where: { walletId: trade.walletId },
      orderBy: { calculatedAt: "desc" },
    });

    const payload: TradeAlertPayload = {
      wallet: {
        address: trade.wallet.address,
        label: trade.wallet.label,
        score,
        winRate: latestScore ? Number(latestScore.winRate) : 0,
        totalPnl: latestScore ? Number(latestScore.totalRealizedPnl) : 0,
      },
      trade: {
        action: trade.action,
        tokenAddress: trade.outputMint,
        tokenSymbol: trade.outputSymbol ?? undefined,
        tokenName: undefined,
        tokenAmount: Number(trade.outputAmount),
        quoteAmount: Number(trade.quoteAmount ?? 0),
        quoteAsset: trade.quoteAsset,
        valueUsd: trade.valueUsd ? Number(trade.valueUsd) : undefined,
        priceUsd: trade.priceUsd ? Number(trade.priceUsd) : undefined,
        txHash: trade.txHash,
        chain: trade.chain,
        source: trade.source ?? undefined,
      },
      token: {
        liquidityUsd: trade.liquidityUsd ? Number(trade.liquidityUsd) : undefined,
        marketCapUsd: trade.marketCapUsd ? Number(trade.marketCapUsd) : undefined,
        tokenAgeMinutes: trade.tokenAgeMinutes ? Number(trade.tokenAgeMinutes) : undefined,
      },
      risk,
      timestamp: trade.timestamp,
    };

    // Always create an alert record (for history), but only send if thresholds met
    const alert = await prisma.alert.create({
      data: {
        walletId: trade.walletId,
        tradeId: trade.id,
        type: AlertType.NEW_TRADE,
        riskLevel: risk.level,
        message: "", // filled by telegram formatter
        payload: payload as object,
        walletScore: score,
        tokenSymbol: trade.outputSymbol,
        tokenAddress: trade.outputMint,
        tradeAction: trade.action,
        tradeValueUsd: trade.valueUsd,
        riskFlags: risk.flags,
      },
    });

    if (shouldAlert) {
      logger.info("AlertService: sending trade alert", {
        walletId: trade.walletId,
        tradeId: trade.id,
        score,
        risk: risk.level,
        value: tradeValueUsd,
      });
      await this.telegram.sendTradeAlert(payload, alert.id);
    } else {
      logger.debug("AlertService: trade below threshold, not alerting", {
        tradeId: trade.id,
        score,
        tradeValueUsd,
        riskLevel: risk.level,
      });
    }
  }

  /**
   * Retry unsent alerts (e.g. after a Telegram outage).
   */
  async retryUnsentAlerts(): Promise<void> {
    const unsent = await prisma.alert.findMany({
      where: { sent: false, sendError: { not: null } },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    for (const alert of unsent) {
      if (!alert.payload) continue;
      const payload = alert.payload as TradeAlertPayload;
      await this.telegram.sendTradeAlert(payload, alert.id);
    }
  }
}
