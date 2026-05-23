import dotenv from "dotenv";
import { z } from "zod";
import type { AppConfig } from "@/types";

dotenv.config();

const envSchema = z.object({
  HELIUS_API_KEY: z.string().optional(),
  SOLANA_RPC_URL: z.string().default("https://api.mainnet-beta.solana.com"),
  BIRDEYE_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  POLL_INTERVAL_MS: z.coerce.number().default(30_000),
  ALERT_MIN_SCORE: z.coerce.number().default(50),
  ALERT_MIN_TRADE_USD: z.coerce.number().default(500),
  RISK_MIN_LIQUIDITY_USD: z.coerce.number().default(50_000),
  RISK_MAX_TOKEN_AGE_MINUTES: z.coerce.number().default(30),
  RISK_MAX_HOLDER_CONCENTRATION: z.coerce.number().default(0.5),
});

const env = envSchema.parse(process.env);

export const config: AppConfig = {
  heliusApiKey: env.HELIUS_API_KEY,
  solanaRpcUrl: env.SOLANA_RPC_URL,
  birdeyeApiKey: env.BIRDEYE_API_KEY,
  telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  telegramChatId: env.TELEGRAM_CHAT_ID,
  pollIntervalMs: env.POLL_INTERVAL_MS,
  alertMinScore: env.ALERT_MIN_SCORE,
  alertMinTradeUsd: env.ALERT_MIN_TRADE_USD,
  risk: {
    minLiquidityUsd: env.RISK_MIN_LIQUIDITY_USD,
    maxTokenAgeMinutes: env.RISK_MAX_TOKEN_AGE_MINUTES,
    maxHolderConcentration: env.RISK_MAX_HOLDER_CONCENTRATION,
  },
};
