/**
 * ExecutionService — STUB
 *
 * This service interface defines the contract for copy-trade execution.
 * The implementation is intentionally left unimplemented to prevent
 * accidental automated trading.
 *
 * To enable copy trading:
 * 1. Implement `CopyTradeExecutor` with real DEX integration (e.g. Jupiter swap API).
 * 2. Add position sizing logic (Kelly criterion or fixed-fraction).
 * 3. Add slippage protection and MEV-aware transaction submission.
 * 4. Wire up `ExecutionService` in `AlertService` after the risk check.
 * 5. Deploy with a separate set of env vars gating execution mode.
 *
 * WARNING: Never enable execution without:
 *   - Maximum loss limits per trade and per day
 *   - Wallet-level allowance controls
 *   - A dry-run mode that simulates execution without spending funds
 */

import type { CopyTradeOrder, ExecutionResult, IExecutionService } from "@/types";

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`ExecutionService.${method} is not implemented. See ExecutionService.ts for instructions.`);
    this.name = "NotImplementedError";
  }
}

export class ExecutionService implements IExecutionService {
  readonly isEnabled = false;

  async executeCopyTrade(_order: CopyTradeOrder): Promise<ExecutionResult> {
    throw new NotImplementedError("executeCopyTrade");
  }

  async dryRun(order: CopyTradeOrder): Promise<ExecutionResult> {
    return {
      success: false,
      skippedReason: `[DRY RUN] Would execute ${order.action} on ${order.tokenAddress} ` +
        `for ~$${order.suggestedSizeUsd.toFixed(0)} — execution is disabled`,
    };
  }
}
