import "dotenv/config";
import { connectDb, disconnectDb } from "@/db/client";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";
import { ChainAdapterRegistry } from "@/services/chain/IChainAdapter";
import { SolanaAdapter } from "@/services/chain/SolanaAdapter";
import { TokenInfoService } from "@/services/TokenInfoService";
import { TransactionParser } from "@/services/TransactionParser";
import { WalletScorer } from "@/services/WalletScorer";
import { RiskEngine } from "@/services/RiskEngine";
import { TelegramService } from "@/services/TelegramService";
import { AlertService } from "@/services/AlertService";
import { WalletMonitor } from "@/services/WalletMonitor";

async function main() {
  logger.info("crypto-tracker monitor starting…");

  await connectDb();

  // Build adapters
  const registry = new ChainAdapterRegistry();
  registry.register(new SolanaAdapter(config.solanaRpcUrl, config.heliusApiKey));
  // registry.register(new EthereumAdapter(...)); // add when ready

  const healthy = await Promise.all(
    registry.getAll().map(async a => ({ chain: a.chain, ok: await a.isHealthy() }))
  );
  for (const { chain, ok } of healthy) {
    if (!ok) logger.warn(`Chain adapter unhealthy: ${chain}`);
    else logger.info(`Chain adapter healthy: ${chain}`);
  }

  // Build services
  const tokenInfo = new TokenInfoService(config.birdeyeApiKey);
  const parser = new TransactionParser(tokenInfo);
  const scorer = new WalletScorer();
  const riskEngine = new RiskEngine(tokenInfo);
  const telegram = new TelegramService(config.telegramBotToken, config.telegramChatId);
  const alertService = new AlertService(scorer, riskEngine, telegram);

  // Notify startup
  if (telegram.isConfigured) {
    await telegram.sendText("🟢 <b>Crypto Tracker Monitor started</b>");
  }

  const monitor = new WalletMonitor(registry, parser, alertService, config.pollIntervalMs);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down…`);
    monitor.stop();
    if (telegram.isConfigured) {
      await telegram.sendText("🔴 <b>Crypto Tracker Monitor stopped</b>");
    }
    await disconnectDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { err });
    shutdown("uncaughtException");
  });

  await monitor.start();
}

main().catch((err) => {
  logger.error("Fatal error during startup", { err });
  process.exit(1);
});
