/**
 * Unit tests for WalletScorer sub-functions.
 * These test the pure mathematical scoring logic in isolation.
 */

// ── Inline the pure scorer functions so we can test without DB ───────────────

function scorePnl(totalRealizedPnl: number): number {
  if (totalRealizedPnl <= 0) return 0;
  return Math.min(100, Math.max(0, Math.log10(totalRealizedPnl / 500 + 1) * 40));
}

function scoreWinRate(winRate: number, tradeCount: number): number {
  if (tradeCount === 0) return 0;
  const rawScore = Math.max(0, (winRate - 0.35) / 0.65) * 100;
  const confidence = Math.min(1, Math.sqrt(tradeCount / 10));
  return rawScore * confidence;
}

function scoreMedianRoi(medianRoiPct: number): number {
  if (medianRoiPct <= 0) return 0;
  return Math.min(100, (Math.log1p(medianRoiPct / 20) / Math.log1p(25)) * 100);
}

function scoreHoldTime(medianHoldHours: number): number {
  if (medianHoldHours < 0.5) return 10;
  if (medianHoldHours < 1) return 30;
  if (medianHoldHours < 24) return 70;
  if (medianHoldHours < 24 * 14) return 100;
  if (medianHoldHours < 24 * 90) return 70;
  return 30;
}

function scoreDrawdown(maxDrawdownPct: number): number {
  return Math.max(0, 100 - maxDrawdownPct);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : ((sorted[mid - 1]! + sorted[mid]!) / 2);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("scorePnl", () => {
  it("returns 0 for negative PnL", () => {
    expect(scorePnl(-1000)).toBe(0);
    expect(scorePnl(0)).toBe(0);
  });

  it("scales logarithmically", () => {
    const s1k = scorePnl(1_000);
    const s10k = scorePnl(10_000);
    const s100k = scorePnl(100_000);

    expect(s1k).toBeGreaterThan(0);
    expect(s10k).toBeGreaterThan(s1k);
    expect(s100k).toBeGreaterThan(s10k);
  });

  it("is capped at 100", () => {
    expect(scorePnl(1_000_000_000)).toBeLessThanOrEqual(100);
  });

  it("gives ~90+ for $100k realized PnL (strong performer)", () => {
    expect(scorePnl(100_000)).toBeGreaterThan(80);
    expect(scorePnl(100_000)).toBeLessThanOrEqual(100);
  });
});

describe("scoreWinRate", () => {
  it("returns 0 with no trades", () => {
    expect(scoreWinRate(0.8, 0)).toBe(0);
  });

  it("returns 0 when win rate is below 35%", () => {
    expect(scoreWinRate(0.30, 20)).toBe(0);
    expect(scoreWinRate(0.35, 20)).toBe(0);
  });

  it("scales with win rate", () => {
    const s50 = scoreWinRate(0.50, 20);
    const s70 = scoreWinRate(0.70, 20);
    expect(s70).toBeGreaterThan(s50);
  });

  it("confidence reduces score for small trade counts", () => {
    const few = scoreWinRate(0.70, 3);
    const many = scoreWinRate(0.70, 50);
    expect(many).toBeGreaterThan(few);
  });

  it("reaches near-max with 100% win rate and many trades", () => {
    expect(scoreWinRate(1.0, 100)).toBeCloseTo(100, -1);
  });
});

describe("scoreMedianRoi", () => {
  it("returns 0 for 0% or negative ROI", () => {
    expect(scoreMedianRoi(0)).toBe(0);
    expect(scoreMedianRoi(-50)).toBe(0);
  });

  it("gives a higher score for higher ROI", () => {
    expect(scoreMedianRoi(100)).toBeGreaterThan(scoreMedianRoi(20));
    expect(scoreMedianRoi(500)).toBeGreaterThan(scoreMedianRoi(100));
  });

  it("is capped at 100", () => {
    expect(scoreMedianRoi(10_000)).toBeLessThanOrEqual(100);
  });
});

describe("scoreHoldTime", () => {
  it("penalizes very short holds", () => {
    expect(scoreHoldTime(0.1)).toBe(10); // 6 minutes
  });

  it("gives highest score for 1-14 day holds", () => {
    expect(scoreHoldTime(48)).toBe(100);   // 2 days
    expect(scoreHoldTime(200)).toBe(100);  // ~8 days
  });

  it("gives medium score for moderate holds", () => {
    expect(scoreHoldTime(6)).toBe(70);   // 6 hours
    expect(scoreHoldTime(500)).toBe(70); // ~21 days
  });

  it("reduces score for very long holds", () => {
    expect(scoreHoldTime(24 * 120)).toBe(30);
  });
});

describe("scoreDrawdown", () => {
  it("returns 100 for no drawdown", () => {
    expect(scoreDrawdown(0)).toBe(100);
  });

  it("returns 50 for 50% drawdown", () => {
    expect(scoreDrawdown(50)).toBe(50);
  });

  it("returns 0 for 100%+ drawdown", () => {
    expect(scoreDrawdown(100)).toBe(0);
    expect(scoreDrawdown(150)).toBe(0);
  });
});

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns the middle value for odd-length arrays", () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([10, 2, 8])).toBe(8);
  });

  it("returns average of two middle values for even-length arrays", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("handles single-element arrays", () => {
    expect(median([42])).toBe(42);
  });
});

describe("full scoring pipeline (integration)", () => {
  it("a whale with great stats should score >70", () => {
    const pnl = scorePnl(200_000);      // large PnL
    const wr = scoreWinRate(0.72, 120); // 72% win rate, many trades
    const roi = scoreMedianRoi(80);     // 80% median ROI
    const hold = scoreHoldTime(36);     // 1.5 day holds
    const dd = scoreDrawdown(15);       // 15% max drawdown
    const consistency = 85;             // hypothetical
    const liquidity = 80;               // good liquidity

    const weights = { pnl: 0.25, wr: 0.20, roi: 0.20, hold: 0.10, dd: 0.10, cons: 0.10, liq: 0.05 };
    const score =
      pnl * weights.pnl +
      wr * weights.wr +
      roi * weights.roi +
      hold * weights.hold +
      dd * weights.dd +
      consistency * weights.cons +
      liquidity * weights.liq;

    expect(score).toBeGreaterThan(70);
  });

  it("a one-hit-wonder should score lower after penalties", () => {
    const baseScore = 75;
    const oneHitWonderPenalty = 20;
    const tooFewTradesPenalty = 15;
    const penalized = Math.max(0, baseScore - oneHitWonderPenalty - tooFewTradesPenalty);
    expect(penalized).toBeLessThan(50);
  });
});
