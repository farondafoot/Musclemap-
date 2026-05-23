import axios from "axios";
import { prisma } from "@/db/client";
import type { TokenInfo } from "@/types";
import { Chain } from "@prisma/client";
import { logger } from "@/utils/logger";

const DEXSCREENER_BASE = "https://api.dexscreener.com";
const BIRDEYE_BASE = "https://public-api.birdeye.so";

const LIQUIDITY_CACHE_TTL_MS = 5 * 60 * 1_000;      // 5 min
const HOLDER_CACHE_TTL_MS = 60 * 60 * 1_000;          // 1 hour

export class TokenInfoService {
  constructor(private birdeyeApiKey?: string) {}

  async getTokenInfo(address: string, chain: Chain): Promise<TokenInfo | null> {
    // Check cache first
    const cached = await this.getCached(address, chain);
    if (cached) return cached;

    // Fetch from APIs
    try {
      const info = await this.fetchFresh(address, chain);
      if (info) await this.upsertCache(address, chain, info);
      return info;
    } catch (err) {
      logger.warn("TokenInfoService: fetch failed", { address, err });
      return null;
    }
  }

  async getMintTimestamp(address: string, chain: Chain): Promise<Date | null> {
    const cached = await prisma.tokenCache.findUnique({
      where: { address },
      select: { mintTimestamp: true, fetchedAt: true },
    });
    if (cached?.mintTimestamp) return cached.mintTimestamp;

    // For Solana, query Birdeye token security endpoint for creation time
    if (chain === Chain.SOLANA && this.birdeyeApiKey) {
      try {
        const res = await axios.get(`${BIRDEYE_BASE}/defi/token_creation_info`, {
          params: { address },
          headers: { "X-API-KEY": this.birdeyeApiKey, "x-chain": "solana" },
          timeout: 10_000,
        });
        const created = res.data?.data?.txTime;
        if (created) {
          const ts = new Date(created * 1000);
          await prisma.tokenCache.upsert({
            where: { address },
            update: { mintTimestamp: ts },
            create: { address, chain, mintTimestamp: ts },
          });
          return ts;
        }
      } catch {
        // silently ignore
      }
    }
    return null;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async getCached(address: string, chain: Chain): Promise<TokenInfo | null> {
    const row = await prisma.tokenCache.findUnique({ where: { address } });
    if (!row) return null;

    const age = Date.now() - row.fetchedAt.getTime();
    if (age > LIQUIDITY_CACHE_TTL_MS) return null;

    return {
      address,
      chain,
      symbol: row.symbol ?? undefined,
      name: row.name ?? undefined,
      decimals: row.decimals ?? undefined,
      logoUri: row.logoUri ?? undefined,
      priceUsd: row.priceUsd ? Number(row.priceUsd) : undefined,
      liquidityUsd: row.liquidityUsd ? Number(row.liquidityUsd) : undefined,
      marketCapUsd: row.marketCapUsd ? Number(row.marketCapUsd) : undefined,
      volume24hUsd: row.volume24hUsd ? Number(row.volume24hUsd) : undefined,
      launchTimestamp: row.mintTimestamp ?? undefined,
      holderCount: row.holderCount ?? undefined,
      topHolderPct: row.top10HolderPct ? Number(row.top10HolderPct) : undefined,
      source: "cache",
    };
  }

  private async fetchFresh(address: string, chain: Chain): Promise<TokenInfo | null> {
    const [dex, birdeye] = await Promise.allSettled([
      this.fetchDexScreener(address, chain),
      this.birdeyeApiKey ? this.fetchBirdeye(address, chain) : Promise.resolve(null),
    ]);

    const dexData = dex.status === "fulfilled" ? dex.value : null;
    const birdeyeData = birdeye.status === "fulfilled" ? birdeye.value : null;

    if (!dexData && !birdeyeData) return null;

    return {
      address,
      chain,
      symbol: dexData?.symbol ?? birdeyeData?.symbol,
      name: dexData?.name ?? birdeyeData?.name,
      decimals: dexData?.decimals ?? birdeyeData?.decimals,
      priceUsd: dexData?.priceUsd ?? birdeyeData?.priceUsd,
      liquidityUsd: dexData?.liquidityUsd ?? birdeyeData?.liquidityUsd,
      marketCapUsd: dexData?.marketCapUsd ?? birdeyeData?.marketCapUsd,
      volume24hUsd: dexData?.volume24hUsd ?? birdeyeData?.volume24hUsd,
      topHolderPct: birdeyeData?.topHolderPct,
      holderCount: birdeyeData?.holderCount,
      source: dexData ? "dexscreener" : "birdeye",
    };
  }

  private async fetchDexScreener(address: string, chain: Chain): Promise<Partial<TokenInfo> | null> {
    const url = `${DEXSCREENER_BASE}/latest/dex/tokens/${address}`;
    const res = await axios.get(url, { timeout: 10_000 });
    const pairs: DexScreenerPair[] = res.data?.pairs ?? [];

    if (!pairs.length) return null;

    // Pick the pair with the highest liquidity
    const best = pairs
      .filter(p => !chain || p.chainId === chainToDs(chain))
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

    if (!best) return null;

    return {
      symbol: best.baseToken?.symbol,
      name: best.baseToken?.name,
      priceUsd: best.priceUsd ? Number(best.priceUsd) : undefined,
      liquidityUsd: best.liquidity?.usd,
      marketCapUsd: best.fdv,
      volume24hUsd: best.volume?.h24,
    };
  }

  private async fetchBirdeye(address: string, chain: Chain): Promise<Partial<TokenInfo> | null> {
    if (!this.birdeyeApiKey) return null;
    const chainStr = chain === Chain.SOLANA ? "solana" : chain.toLowerCase();

    const [priceRes, securityRes] = await Promise.allSettled([
      axios.get(`${BIRDEYE_BASE}/defi/price`, {
        params: { address },
        headers: { "X-API-KEY": this.birdeyeApiKey, "x-chain": chainStr },
        timeout: 10_000,
      }),
      axios.get(`${BIRDEYE_BASE}/defi/token_security`, {
        params: { address },
        headers: { "X-API-KEY": this.birdeyeApiKey, "x-chain": chainStr },
        timeout: 10_000,
      }),
    ]);

    const priceData = priceRes.status === "fulfilled" ? priceRes.value.data?.data : null;
    const secData = securityRes.status === "fulfilled" ? securityRes.value.data?.data : null;

    return {
      priceUsd: priceData?.value,
      liquidityUsd: priceData?.liquidity,
      marketCapUsd: priceData?.marketCap,
      holderCount: secData?.holderCount,
      topHolderPct: secData?.top10HolderPercent,
    };
  }

  private async upsertCache(address: string, chain: Chain, info: TokenInfo): Promise<void> {
    await prisma.tokenCache.upsert({
      where: { address },
      create: {
        address,
        chain,
        symbol: info.symbol,
        name: info.name,
        decimals: info.decimals,
        logoUri: info.logoUri,
        priceUsd: info.priceUsd,
        liquidityUsd: info.liquidityUsd,
        marketCapUsd: info.marketCapUsd,
        fdvUsd: info.marketCapUsd,
        volume24hUsd: info.volume24hUsd,
        holderCount: info.holderCount,
        top10HolderPct: info.topHolderPct,
        mintTimestamp: info.launchTimestamp,
      },
      update: {
        symbol: info.symbol,
        name: info.name,
        priceUsd: info.priceUsd,
        liquidityUsd: info.liquidityUsd,
        marketCapUsd: info.marketCapUsd,
        fdvUsd: info.marketCapUsd,
        volume24hUsd: info.volume24hUsd,
        holderCount: info.holderCount ?? undefined,
        top10HolderPct: info.topHolderPct ?? undefined,
      },
    });
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DexScreenerPair {
  chainId: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  liquidity?: { usd: number };
  fdv?: number;
  volume?: { h24: number };
}

function chainToDs(chain: Chain): string {
  switch (chain) {
    case Chain.SOLANA: return "solana";
    case Chain.ETHEREUM: return "ethereum";
    case Chain.BASE: return "base";
  }
}
