import { prisma } from "@/db/client";
import { TokenInfoService } from "./TokenInfoService";
import type { RawSwapEvent } from "@/types";
import { Chain, TradeAction } from "@prisma/client";
import { logger } from "@/utils/logger";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export class TransactionParser {
  constructor(private tokenInfo: TokenInfoService) {}

  /**
   * Persist a raw swap event as a Trade record, enriching it with token
   * metadata and computing USD values where possible.
   */
  async parseAndSave(event: RawSwapEvent, walletId: string): Promise<string | null> {
    // Skip if already stored
    const existing = await prisma.trade.findUnique({
      where: { txHash_chain: { txHash: event.txHash, chain: event.chain } },
      select: { id: true },
    });
    if (existing) return existing.id;

    const token = await this.tokenInfo.getTokenInfo(
      this.resolveTokenMint(event),
      event.chain
    );

    const priceUsd = token?.priceUsd;
    const valueUsd = this.computeValueUsd(event, priceUsd);
    const tokenAgeMinutes = await this.getTokenAgeMinutes(
      this.resolveTokenMint(event),
      event.chain,
      event.timestamp
    );

    const trade = await prisma.trade.create({
      data: {
        walletId,
        chain: event.chain,
        txHash: event.txHash,
        slot: event.slot ? BigInt(event.slot) : null,
        timestamp: event.timestamp,
        action: event.action,

        inputMint: event.action === TradeAction.BUY ? event.quoteAsset : event.tokenAddress,
        inputSymbol: event.action === TradeAction.BUY ? event.quoteAsset : token?.symbol,
        inputAmount: event.action === TradeAction.BUY ? event.quoteAmount : event.tokenAmount,

        outputMint: event.action === TradeAction.BUY ? event.tokenAddress : event.quoteAsset,
        outputSymbol: event.action === TradeAction.BUY ? token?.symbol : event.quoteAsset,
        outputAmount: event.action === TradeAction.BUY ? event.tokenAmount : event.quoteAmount,

        quoteAsset: event.quoteAsset,
        quoteAmount: event.quoteAmount,
        priceUsd: priceUsd ?? null,
        valueUsd: valueUsd ?? null,

        liquidityUsd: token?.liquidityUsd ?? null,
        marketCapUsd: token?.marketCapUsd ?? null,
        tokenAgeMinutes: tokenAgeMinutes ?? null,

        source: event.source,
        rawData: event.rawData ? (event.rawData as object) : undefined,
      },
    });

    // For SELL trades, attempt to calculate realized PnL against open position
    if (event.action === TradeAction.SELL) {
      await this.pairSellTrade(trade.id, walletId, event.tokenAddress, event.chain, event.tokenAmount, valueUsd);
    } else {
      // Open or top-up a position
      await this.updatePosition(walletId, event.tokenAddress, event.chain, {
        action: "BUY",
        tokenAmount: event.tokenAmount,
        costUsd: valueUsd ?? 0,
        timestamp: event.timestamp,
      });
    }

    logger.debug("Trade saved", {
      txHash: event.txHash,
      action: event.action,
      token: token?.symbol ?? event.tokenAddress.slice(0, 8),
      valueUsd,
    });

    return trade.id;
  }

  // ── PnL pairing ──────────────────────────────────────────────────────────

  /**
   * Match a SELL trade against the wallet's open position for this token,
   * compute realized PnL using FIFO cost basis, and update the position.
   */
  private async pairSellTrade(
    tradeId: string,
    walletId: string,
    tokenAddress: string,
    chain: Chain,
    tokenAmount: number,
    saleValueUsd: number | null
  ): Promise<void> {
    const position = await prisma.position.findUnique({
      where: { walletId_tokenAddress_chain: { walletId, tokenAddress, chain } },
    });

    if (!position || !position.isOpen || Number(position.tokenAmount) <= 0) {
      await prisma.trade.update({ where: { id: tradeId }, data: { isPaired: true } });
      return;
    }

    const costBasis = Number(position.avgEntryPriceUsd) * Math.min(tokenAmount, Number(position.tokenAmount));
    const saleValue = saleValueUsd ?? 0;
    const realizedPnl = saleValue - costBasis;
    const roi = costBasis > 0 ? (realizedPnl / costBasis) * 100 : 0;

    const newAmount = Math.max(0, Number(position.tokenAmount) - tokenAmount);
    const newCost = newAmount * Number(position.avgEntryPriceUsd);

    await prisma.$transaction([
      prisma.trade.update({
        where: { id: tradeId },
        data: {
          realizedPnlUsd: realizedPnl,
          roiPercent: roi,
          isWin: realizedPnl > 0,
          isPaired: true,
        },
      }),
      prisma.position.update({
        where: { walletId_tokenAddress_chain: { walletId, tokenAddress, chain } },
        data: {
          tokenAmount: newAmount,
          totalCostUsd: newCost,
          realizedPnl: { increment: realizedPnl },
          isOpen: newAmount > 0.000001,
          closedAt: newAmount <= 0.000001 ? new Date() : null,
        },
      }),
    ]);
  }

  /**
   * Open or top-up an open position when a BUY is detected.
   */
  private async updatePosition(
    walletId: string,
    tokenAddress: string,
    chain: Chain,
    data: { action: "BUY"; tokenAmount: number; costUsd: number; timestamp: Date }
  ): Promise<void> {
    const existing = await prisma.position.findUnique({
      where: { walletId_tokenAddress_chain: { walletId, tokenAddress, chain } },
    });

    if (!existing) {
      await prisma.position.create({
        data: {
          walletId,
          tokenAddress,
          chain,
          tokenAmount: data.tokenAmount,
          avgEntryPriceUsd: data.tokenAmount > 0 ? data.costUsd / data.tokenAmount : 0,
          totalCostUsd: data.costUsd,
          openedAt: data.timestamp,
        },
      });
    } else {
      const newAmount = Number(existing.tokenAmount) + data.tokenAmount;
      const newCost = Number(existing.totalCostUsd) + data.costUsd;
      await prisma.position.update({
        where: { walletId_tokenAddress_chain: { walletId, tokenAddress, chain } },
        data: {
          tokenAmount: newAmount,
          avgEntryPriceUsd: newAmount > 0 ? newCost / newAmount : 0,
          totalCostUsd: newCost,
          isOpen: true,
          closedAt: null,
        },
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolveTokenMint(event: RawSwapEvent): string {
    // The "interesting" token is the non-quote asset
    const quoteAssets = new Set([SOL_MINT, USDC_MINT, "SOL", "USDC", "USDT"]);
    if (event.action === TradeAction.BUY) return event.tokenAddress;
    return event.tokenAddress;
  }

  private computeValueUsd(event: RawSwapEvent, tokenPriceUsd?: number): number | null {
    if (event.quoteAsset === "USDC" || event.quoteAsset === "USDT") {
      return event.quoteAmount;
    }
    // Estimate: if we know token price, compute from token amount
    if (tokenPriceUsd && event.tokenAmount > 0) {
      return tokenPriceUsd * event.tokenAmount;
    }
    return null;
  }

  private async getTokenAgeMinutes(
    tokenAddress: string,
    chain: Chain,
    tradeTimestamp: Date
  ): Promise<number | null> {
    const mintTs = await this.tokenInfo.getMintTimestamp(tokenAddress, chain);
    if (!mintTs) return null;
    return (tradeTimestamp.getTime() - mintTs.getTime()) / 60_000;
  }
}
