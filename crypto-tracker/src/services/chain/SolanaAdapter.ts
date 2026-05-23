import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from "@solana/web3.js";
import axios from "axios";
import { Chain, TradeAction } from "@prisma/client";
import type { IChainAdapter, RawSwapEvent } from "@/types";
import { logger } from "@/utils/logger";

// Known DEX program IDs on Solana
const KNOWN_DEX_PROGRAMS: Record<string, string> = {
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: "JUPITER_V4",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "JUPITER_V6",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "RAYDIUM_AMM",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "RAYDIUM_CLMM",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "ORCA_WHIRLPOOL",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": "ORCA_V2",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "PUMP_FUN",
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const STABLE_MINTS = new Set([USDC_MINT, USDT_MINT]);

// ─── Helius enhanced transaction shape (relevant fields) ────────────────────

interface HeliusEnrichedTx {
  signature: string;
  slot: number;
  timestamp: number;
  type: string;
  source: string;
  feePayer: string;
  description: string;
  events?: {
    swap?: {
      nativeInput: { account: string; amount: string } | null;
      nativeOutput: { account: string; amount: string } | null;
      tokenInputs: HeliusTokenTransfer[];
      tokenOutputs: HeliusTokenTransfer[];
    };
  };
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: { fromUserAccount: string; toUserAccount: string; amount: number }[];
}

interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount: number;
  rawTokenAmount?: { tokenAmount: string; decimals: number };
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export class SolanaAdapter implements IChainAdapter {
  readonly chain = Chain.SOLANA;

  private connection: Connection;
  private heliusApiKey?: string;

  constructor(rpcUrl: string, heliusApiKey?: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.heliusApiKey = heliusApiKey;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.connection.getSlot();
      return true;
    } catch {
      return false;
    }
  }

  async getRecentSwaps(walletAddress: string, since: Date): Promise<RawSwapEvent[]> {
    if (this.heliusApiKey) {
      try {
        return await this.getHeliusSwaps(walletAddress, since);
      } catch (err) {
        logger.warn("Helius API failed, falling back to raw RPC", { err, walletAddress });
      }
    }
    return this.getRpcSwaps(walletAddress, since);
  }

  // ── Helius enhanced path ──────────────────────────────────────────────────

  private async getHeliusSwaps(walletAddress: string, since: Date): Promise<RawSwapEvent[]> {
    const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions`;
    const params: Record<string, string> = {
      "api-key": this.heliusApiKey!,
      type: "SWAP",
      limit: "100",
    };

    const response = await axios.get<HeliusEnrichedTx[]>(url, { params, timeout: 15_000 });
    const txs = response.data;

    const sinceMs = since.getTime();
    const events: RawSwapEvent[] = [];

    for (const tx of txs) {
      const txTime = tx.timestamp * 1000;
      if (txTime <= sinceMs) break; // Helius returns newest-first

      const event = this.parseHeliusTx(tx, walletAddress);
      if (event) events.push(event);
    }

    return events;
  }

  private parseHeliusTx(tx: HeliusEnrichedTx, walletAddress: string): RawSwapEvent | null {
    const swap = tx.events?.swap;
    if (!swap) return null;

    const wallet = walletAddress.toLowerCase();

    // Determine what the wallet sent (input) and received (output)
    let inputMint: string | null = null;
    let inputAmount = 0;
    let outputMint: string | null = null;
    let outputAmount = 0;

    // Native SOL in → token out (buy)
    if (swap.nativeInput?.account === walletAddress && swap.tokenOutputs.length > 0) {
      inputMint = SOL_MINT;
      inputAmount = Number(swap.nativeInput.amount) / 1e9;
      const out = swap.tokenOutputs.find(t => t.toUserAccount === walletAddress) ?? swap.tokenOutputs[0];
      outputMint = out.mint;
      outputAmount = out.tokenAmount;
    }
    // Token in → native SOL out (sell)
    else if (swap.nativeOutput?.account === walletAddress && swap.tokenInputs.length > 0) {
      const inp = swap.tokenInputs.find(t => t.fromUserAccount === walletAddress) ?? swap.tokenInputs[0];
      inputMint = inp.mint;
      inputAmount = inp.tokenAmount;
      outputMint = SOL_MINT;
      outputAmount = Number(swap.nativeOutput.amount) / 1e9;
    }
    // Token → token (use wallet-side transfers)
    else if (swap.tokenInputs.length > 0 && swap.tokenOutputs.length > 0) {
      const inp = swap.tokenInputs.find(t => t.fromUserAccount === walletAddress) ?? swap.tokenInputs[0];
      const out = swap.tokenOutputs.find(t => t.toUserAccount === walletAddress) ?? swap.tokenOutputs[0];
      inputMint = inp.mint;
      inputAmount = inp.tokenAmount;
      outputMint = out.mint;
      outputAmount = out.tokenAmount;
    }

    if (!inputMint || !outputMint) return null;

    // Classify BUY vs SELL relative to the "interesting" token
    // Convention: if outputMint is not a quote asset → BUY token
    //             if inputMint is not a quote asset → SELL token
    const quoteMints = new Set([SOL_MINT, ...STABLE_MINTS]);
    const isBuy = quoteMints.has(inputMint) && !quoteMints.has(outputMint);
    const isSell = !quoteMints.has(inputMint) && quoteMints.has(outputMint);

    if (!isBuy && !isSell) return null; // token-to-token, skip for now

    const tokenMint = isBuy ? outputMint : inputMint;
    const tokenAmount = isBuy ? outputAmount : inputAmount;
    const quoteAsset = this.resolveQuoteAsset(isBuy ? inputMint : outputMint);
    const quoteAmount = isBuy ? inputAmount : outputAmount;

    return {
      txHash: tx.signature,
      slot: tx.slot,
      timestamp: new Date(tx.timestamp * 1000),
      walletAddress,
      chain: Chain.SOLANA,
      action: isBuy ? TradeAction.BUY : TradeAction.SELL,
      tokenAddress: tokenMint,
      tokenAmount,
      quoteAsset,
      quoteAmount,
      source: tx.source || "UNKNOWN",
      rawData: tx,
    };
  }

  // ── Raw RPC fallback ──────────────────────────────────────────────────────

  private async getRpcSwaps(walletAddress: string, since: Date): Promise<RawSwapEvent[]> {
    const pubkey = new PublicKey(walletAddress);
    const sinceMs = since.getTime();

    // Fetch up to 50 recent signatures
    const signatures: ConfirmedSignatureInfo[] = await this.connection.getSignaturesForAddress(
      pubkey,
      { limit: 50 }
    );

    const events: RawSwapEvent[] = [];

    for (const sig of signatures) {
      if (!sig.blockTime) continue;
      if (sig.blockTime * 1000 <= sinceMs) break;
      if (sig.err) continue;

      try {
        const tx = await this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx) continue;

        const event = this.parseRpcTransaction(tx, sig.signature, walletAddress);
        if (event) events.push(event);
      } catch (err) {
        logger.debug("Failed to parse tx", { sig: sig.signature, err });
      }
    }

    return events;
  }

  private parseRpcTransaction(
    tx: ParsedTransactionWithMeta,
    signature: string,
    walletAddress: string
  ): RawSwapEvent | null {
    if (!tx.meta) return null;

    // Detect DEX involvement
    const accountKeys = tx.transaction.message.accountKeys.map(k =>
      typeof k === "string" ? k : k.pubkey.toString()
    );
    const dexSource = accountKeys
      .map(k => KNOWN_DEX_PROGRAMS[k])
      .find(Boolean);

    if (!dexSource) return null;

    // Analyze pre/post token balances to infer swap direction
    const preBalances = tx.meta.preTokenBalances ?? [];
    const postBalances = tx.meta.postTokenBalances ?? [];

    // Find balance changes for the wallet's accounts
    const walletChanges: Record<string, { pre: number; post: number; decimals: number }> = {};

    for (const post of postBalances) {
      const accountKey = accountKeys[post.accountIndex];
      if (post.owner !== walletAddress && post.owner !== walletAddress) continue;
      if (!post.mint || post.mint === SOL_MINT) continue;

      const pre = preBalances.find(
        b => b.accountIndex === post.accountIndex && b.mint === post.mint
      );
      const preAmount = Number(pre?.uiTokenAmount.uiAmount ?? 0);
      const postAmount = Number(post.uiTokenAmount.uiAmount ?? 0);
      const decimals = post.uiTokenAmount.decimals;

      walletChanges[post.mint] = { pre: preAmount, post: postAmount, decimals };
    }

    // SOL balance change
    const walletIndex = accountKeys.indexOf(walletAddress);
    let solChange = 0;
    if (walletIndex >= 0) {
      solChange =
        ((tx.meta.postBalances[walletIndex] ?? 0) -
          (tx.meta.preBalances[walletIndex] ?? 0)) /
        1e9;
    }

    // Find token that changed significantly
    let primaryToken: string | null = null;
    let primaryChange = 0;
    for (const [mint, change] of Object.entries(walletChanges)) {
      const delta = change.post - change.pre;
      if (Math.abs(delta) > Math.abs(primaryChange)) {
        primaryChange = delta;
        primaryToken = mint;
      }
    }

    if (!primaryToken) return null;

    const isBuy = primaryChange > 0;
    const quoteAmount = Math.abs(solChange);

    if (quoteAmount < 0.001) return null; // tiny, skip

    return {
      txHash: signature,
      slot: tx.slot,
      timestamp: new Date((tx.blockTime ?? 0) * 1000),
      walletAddress,
      chain: Chain.SOLANA,
      action: isBuy ? TradeAction.BUY : TradeAction.SELL,
      tokenAddress: primaryToken,
      tokenAmount: Math.abs(primaryChange),
      quoteAsset: "SOL",
      quoteAmount,
      source: dexSource,
      rawData: null,
    };
  }

  private resolveQuoteAsset(mint: string): string {
    if (mint === SOL_MINT) return "SOL";
    if (mint === USDC_MINT) return "USDC";
    if (mint === USDT_MINT) return "USDT";
    return mint.slice(0, 6);
  }
}
