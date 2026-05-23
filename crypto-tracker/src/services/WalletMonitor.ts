import pLimit from "p-limit";
import { prisma } from "@/db/client";
import { ChainAdapterRegistry } from "./chain/IChainAdapter";
import { TransactionParser } from "./TransactionParser";
import { AlertService } from "./AlertService";
import { WalletStatus } from "@prisma/client";
import { logger } from "@/utils/logger";

const MAX_CONCURRENT_WALLETS = 5;  // prevent rate-limit hammering

export class WalletMonitor {
  private running = false;
  private limit = pLimit(MAX_CONCURRENT_WALLETS);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private adapters: ChainAdapterRegistry,
    private parser: TransactionParser,
    private alertService: AlertService,
    private pollIntervalMs: number
  ) {}

  async start(): Promise<void> {
    this.running = true;
    logger.info("WalletMonitor: starting", { pollIntervalMs: this.pollIntervalMs });

    // Run once immediately, then on interval
    await this.poll();
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info("WalletMonitor: stopped");
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.poll();
      this.scheduleNext();
    }, this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    const wallets = await prisma.trackedWallet.findMany({
      where: { status: WalletStatus.ACTIVE },
      select: { id: true, address: true, chain: true, lastSignature: true, lastPolledAt: true },
    });

    if (!wallets.length) {
      logger.debug("WalletMonitor: no active wallets to poll");
      return;
    }

    logger.info(`WalletMonitor: polling ${wallets.length} wallets`);

    const results = await Promise.allSettled(
      wallets.map(w => this.limit(() => this.pollWallet(w)))
    );

    const errors = results.filter(r => r.status === "rejected");
    if (errors.length) {
      logger.warn(`WalletMonitor: ${errors.length}/${wallets.length} wallets failed`);
    }
  }

  private async pollWallet(wallet: {
    id: string;
    address: string;
    chain: string;
    lastSignature: string | null;
    lastPolledAt: Date | null;
  }): Promise<void> {
    const adapter = this.adapters.get(wallet.chain);
    if (!adapter) {
      logger.warn("WalletMonitor: no adapter for chain", { chain: wallet.chain, wallet: wallet.address });
      return;
    }

    // Default: look back 24h on first run; subsequent runs use cursor
    const since = wallet.lastPolledAt ?? new Date(Date.now() - 24 * 3600_000);

    let swaps;
    try {
      swaps = await adapter.getRecentSwaps(wallet.address, since);
    } catch (err) {
      logger.error("WalletMonitor: getRecentSwaps failed", { wallet: wallet.address, err });
      return;
    }

    if (!swaps.length) {
      await prisma.trackedWallet.update({
        where: { id: wallet.id },
        data: { lastPolledAt: new Date() },
      });
      return;
    }

    logger.info(`WalletMonitor: ${swaps.length} new swaps for ${wallet.address.slice(0, 8)}…`);

    // Process oldest-first so PnL pairing is sequential
    const sorted = [...swaps].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    for (const swap of sorted) {
      try {
        const tradeId = await this.parser.parseAndSave(swap, wallet.id);
        if (tradeId) {
          await this.alertService.handleNewTrade(tradeId);
        }
      } catch (err) {
        logger.error("WalletMonitor: failed to process swap", { txHash: swap.txHash, err });
      }
    }

    // Update cursor (store most recent signature for incremental polling)
    const newest = sorted[sorted.length - 1];
    await prisma.trackedWallet.update({
      where: { id: wallet.id },
      data: {
        lastPolledAt: new Date(),
        lastSignature: newest?.txHash ?? wallet.lastSignature,
      },
    });
  }
}
