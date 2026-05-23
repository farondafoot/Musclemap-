import { Chain, TradeAction, RiskLevel, AlertType } from "@prisma/client";

export { Chain, TradeAction, RiskLevel, AlertType };

// ─── Raw data from chain adapters ─────────────────────────────────────────────

export interface RawSwapEvent {
  txHash: string;
  slot?: number;
  timestamp: Date;
  walletAddress: string;
  chain: Chain;

  action: TradeAction;
  tokenAddress: string;
  tokenSymbol?: string;
  tokenDecimals?: number;

  tokenAmount: number;       // token units (human-readable)
  quoteAsset: string;        // "SOL", "USDC", etc.
  quoteAmount: number;       // human-readable

  source?: string;           // DEX name: "JUPITER", "RAYDIUM", ...
  rawData?: unknown;
}

// ─── Token info from price APIs ───────────────────────────────────────────────

export interface TokenInfo {
  address: string;
  chain: Chain;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoUri?: string;

  priceUsd?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;

  launchTimestamp?: Date;
  holderCount?: number;
  topHolderPct?: number;   // fraction held by top 10 (0-1)

  source: "dexscreener" | "birdeye" | "cache";
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export interface ScoreComponents {
  realizedPnlScore: number;   // 0-25
  winRateScore: number;       // 0-20
  medianRoiScore: number;     // 0-15
  consistencyScore: number;   // 0-15
  holdTimeScore: number;      // 0-10
  tradeQualityScore: number;  // 0-15
}

export interface ScorePenalties {
  oneHitWonder?: number;
  illiquidTrader?: number;
  inactive?: number;
  tooFewTrades?: number;
}

export interface WalletMetrics {
  tradeCount: number;
  profitableTradeCount: number;
  winRate: number;            // 0-1
  totalRealizedPnl: number;   // USD
  medianRoiPct: number;
  avgHoldTimeHours: number;
  maxDrawdownPct: number;

  pnl7d: number | null;
  pnl30d: number | null;
  pnl90d: number | null;
  winRate7d: number | null;
  winRate30d: number | null;
  winRate90d: number | null;
}

// ─── Risk engine ─────────────────────────────────────────────────────────────

export type RiskFlag =
  | "LOW_LIQUIDITY"
  | "VERY_LOW_LIQUIDITY"
  | "NEW_TOKEN"
  | "VERY_NEW_TOKEN"
  | "HIGH_HOLDER_CONCENTRATION"
  | "KNOWN_SCAM"
  | "PUMP_AND_DUMP_PATTERN"
  | "WALLET_SELLING_INTO_FOLLOWERS"
  | "SUSPICIOUS_PRE_BUY_TRANSFER"
  | "ONE_HIT_WONDER_WALLET"
  | "HONEYPOT_SUSPECTED"
  | "MICRO_CAP_EXTREME";

export interface RiskAssessment {
  flags: RiskFlag[];
  score: number;      // 0-100, higher = riskier
  level: RiskLevel;
  details: Record<RiskFlag, string>;
}

// ─── Alert payload ────────────────────────────────────────────────────────────

export interface TradeAlertPayload {
  wallet: {
    address: string;
    label?: string | null;
    score: number;
    winRate: number;
    totalPnl: number;
  };
  trade: {
    action: TradeAction;
    tokenAddress: string;
    tokenSymbol?: string;
    tokenName?: string;
    tokenAmount: number;
    quoteAmount: number;
    quoteAsset: string;
    valueUsd?: number;
    priceUsd?: number;
    txHash: string;
    chain: Chain;
    source?: string;
  };
  token: {
    liquidityUsd?: number;
    marketCapUsd?: number;
    tokenAgeMinutes?: number;
    holderCount?: number;
    topHolderPct?: number;
  };
  risk: RiskAssessment;
  timestamp: Date;
}

// ─── Execution interface (DISABLED — stub only) ───────────────────────────────

export interface CopyTradeOrder {
  walletAddress: string;
  tokenAddress: string;
  action: TradeAction;
  chain: Chain;
  suggestedSizeUsd: number;
  confidence: number;    // 0-1
  referenceTradeId: string;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  skippedReason?: string;
}

export interface IExecutionService {
  isEnabled: boolean;
  executeCopyTrade(order: CopyTradeOrder): Promise<ExecutionResult>;
  dryRun(order: CopyTradeOrder): Promise<ExecutionResult>;
}

// ─── Chain adapter interface ──────────────────────────────────────────────────

export interface IChainAdapter {
  chain: Chain;
  getRecentSwaps(walletAddress: string, since: Date): Promise<RawSwapEvent[]>;
  isHealthy(): Promise<boolean>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface AppConfig {
  heliusApiKey?: string;
  solanaRpcUrl: string;
  birdeyeApiKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  pollIntervalMs: number;
  alertMinScore: number;
  alertMinTradeUsd: number;
  risk: {
    minLiquidityUsd: number;
    maxTokenAgeMinutes: number;
    maxHolderConcentration: number;
  };
}
