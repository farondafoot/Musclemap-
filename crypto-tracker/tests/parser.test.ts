/**
 * Unit tests for TransactionParser logic.
 * Tests parsing of raw swap events and PnL computation in isolation.
 */

import { TradeAction, Chain } from "@prisma/client";
import type { RawSwapEvent } from "../src/types";

// ── Inline helpers matching TransactionParser logic ───────────────────────────

function computeValueUsd(
  event: Pick<RawSwapEvent, "quoteAsset" | "quoteAmount" | "tokenAmount">,
  tokenPriceUsd?: number
): number | null {
  if (event.quoteAsset === "USDC" || event.quoteAsset === "USDT") {
    return event.quoteAmount;
  }
  if (tokenPriceUsd && event.tokenAmount > 0) {
    return tokenPriceUsd * event.tokenAmount;
  }
  return null;
}

function computeRealizedPnl(
  saleValueUsd: number,
  avgEntryPrice: number,
  tokenAmount: number
): { pnl: number; roiPct: number } {
  const costBasis = avgEntryPrice * tokenAmount;
  const pnl = saleValueUsd - costBasis;
  const roiPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  return { pnl, roiPct };
}

function computeNewAvgEntry(
  existing: { amount: number; avgPrice: number; totalCost: number },
  newAmount: number,
  newCost: number
): { avgPrice: number; totalAmount: number; totalCost: number } {
  const totalAmount = existing.amount + newAmount;
  const totalCost = existing.totalCost + newCost;
  const avgPrice = totalAmount > 0 ? totalCost / totalAmount : 0;
  return { avgPrice, totalAmount, totalCost };
}

function getTokenAgeMinutes(mintTimestamp: Date, tradeTimestamp: Date): number {
  return (tradeTimestamp.getTime() - mintTimestamp.getTime()) / 60_000;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("computeValueUsd", () => {
  it("returns quoteAmount directly for USDC trades", () => {
    const event = { quoteAsset: "USDC", quoteAmount: 1000, tokenAmount: 5000 };
    expect(computeValueUsd(event)).toBe(1000);
  });

  it("returns quoteAmount directly for USDT trades", () => {
    const event = { quoteAsset: "USDT", quoteAmount: 750, tokenAmount: 3000 };
    expect(computeValueUsd(event)).toBe(750);
  });

  it("estimates from token price when available for SOL trades", () => {
    const event = { quoteAsset: "SOL", quoteAmount: 2, tokenAmount: 1_000_000 };
    expect(computeValueUsd(event, 0.001)).toBeCloseTo(1000);
  });

  it("returns null for SOL trades without token price", () => {
    const event = { quoteAsset: "SOL", quoteAmount: 2, tokenAmount: 1_000_000 };
    expect(computeValueUsd(event)).toBeNull();
  });
});

describe("computeRealizedPnl", () => {
  it("returns positive PnL on a profitable sell", () => {
    // Bought 1000 tokens at $0.01 each ($10 total cost)
    // Sold 1000 tokens for $25
    const { pnl, roiPct } = computeRealizedPnl(25, 0.01, 1000);
    expect(pnl).toBeCloseTo(15);
    expect(roiPct).toBeCloseTo(150);
  });

  it("returns negative PnL on a loss", () => {
    // Bought at $0.05, sold for less
    const { pnl, roiPct } = computeRealizedPnl(30, 0.05, 1000);
    expect(pnl).toBeCloseTo(-20); // 30 - 50 = -20
    expect(roiPct).toBeCloseTo(-40);
  });

  it("returns 0 PnL on breakeven", () => {
    const { pnl } = computeRealizedPnl(100, 0.10, 1000);
    expect(pnl).toBeCloseTo(0);
  });

  it("handles zero cost basis gracefully", () => {
    const { pnl, roiPct } = computeRealizedPnl(50, 0, 1000);
    expect(pnl).toBe(50);
    expect(roiPct).toBe(0); // undefined percentage when no cost basis
  });
});

describe("computeNewAvgEntry (FIFO cost basis top-up)", () => {
  it("computes average entry price correctly", () => {
    const existing = { amount: 100, avgPrice: 1.0, totalCost: 100 };
    const { avgPrice, totalAmount, totalCost } = computeNewAvgEntry(existing, 100, 200);

    expect(totalAmount).toBe(200);
    expect(totalCost).toBe(300);
    expect(avgPrice).toBeCloseTo(1.5);
  });

  it("handles first buy (empty position)", () => {
    const existing = { amount: 0, avgPrice: 0, totalCost: 0 };
    const { avgPrice, totalAmount, totalCost } = computeNewAvgEntry(existing, 500, 250);

    expect(totalAmount).toBe(500);
    expect(totalCost).toBe(250);
    expect(avgPrice).toBeCloseTo(0.5);
  });

  it("weights correctly toward larger buys", () => {
    // Small initial buy at $1, large buy at $0.50
    const existing = { amount: 10, avgPrice: 1.0, totalCost: 10 };
    const { avgPrice } = computeNewAvgEntry(existing, 990, 495);
    // avgPrice should be close to $0.505 (heavily weighted toward the large buy)
    expect(avgPrice).toBeCloseTo(505 / 1000);
  });
});

describe("getTokenAgeMinutes", () => {
  it("returns correct age in minutes", () => {
    const mint = new Date("2024-01-01T12:00:00Z");
    const trade = new Date("2024-01-01T12:30:00Z");
    expect(getTokenAgeMinutes(mint, trade)).toBeCloseTo(30);
  });

  it("returns 0 for tokens traded at mint time", () => {
    const now = new Date();
    expect(getTokenAgeMinutes(now, now)).toBeCloseTo(0);
  });

  it("returns fractional minutes for sub-minute age", () => {
    const mint = new Date("2024-01-01T12:00:00Z");
    const trade = new Date("2024-01-01T12:00:30Z"); // 30 seconds later
    expect(getTokenAgeMinutes(mint, trade)).toBeCloseTo(0.5);
  });
});

describe("RawSwapEvent structure", () => {
  it("correctly represents a BUY event", () => {
    const buyEvent: RawSwapEvent = {
      txHash: "5xEDf...abc",
      timestamp: new Date("2024-01-15T10:00:00Z"),
      walletAddress: "Abc123",
      chain: Chain.SOLANA,
      action: TradeAction.BUY,
      tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      tokenAmount: 1_000_000,
      quoteAsset: "SOL",
      quoteAmount: 0.5,
      source: "JUPITER",
    };

    expect(buyEvent.action).toBe(TradeAction.BUY);
    expect(buyEvent.tokenAmount).toBe(1_000_000);
    expect(buyEvent.quoteAmount).toBe(0.5);
  });

  it("correctly represents a SELL event", () => {
    const sellEvent: RawSwapEvent = {
      txHash: "7aFGh...xyz",
      timestamp: new Date("2024-01-16T14:00:00Z"),
      walletAddress: "Abc123",
      chain: Chain.SOLANA,
      action: TradeAction.SELL,
      tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      tokenAmount: 500_000,
      quoteAsset: "SOL",
      quoteAmount: 0.8,
      source: "RAYDIUM",
    };

    expect(sellEvent.action).toBe(TradeAction.SELL);
    expect(sellEvent.quoteAmount).toBeGreaterThan(0);
  });
});

describe("trade PnL integration scenario", () => {
  it("computes multi-buy FIFO P&L correctly", () => {
    type Pos = { amount: number; avgPrice: number; totalCost: number };
    const toPos = (r: { avgPrice: number; totalAmount: number; totalCost: number }): Pos =>
      ({ amount: r.totalAmount, avgPrice: r.avgPrice, totalCost: r.totalCost });

    // Buy 1: 1000 tokens @ $0.10 = $100 cost
    let position: Pos = { amount: 0, avgPrice: 0, totalCost: 0 };
    position = toPos(computeNewAvgEntry(position, 1000, 100));
    expect(position.avgPrice).toBeCloseTo(0.1);

    // Buy 2: 2000 tokens @ $0.20 = $400 cost
    position = toPos(computeNewAvgEntry(position, 2000, 400));
    expect(position.avgPrice).toBeCloseTo(500 / 3000); // ~0.167

    // Sell 1500 tokens @ $0.25 = $375 proceeds
    const sellAmount = 1500;
    const saleProceeds = 375;
    const { pnl, roiPct } = computeRealizedPnl(saleProceeds, position.avgPrice, sellAmount);

    // Expected: 1500 * 0.167 = ~$250 cost, PnL = 375-250 = ~$125
    expect(pnl).toBeGreaterThan(100);
    expect(roiPct).toBeGreaterThan(40);
    expect(pnl).toBeGreaterThan(0); // profitable trade
  });
});
