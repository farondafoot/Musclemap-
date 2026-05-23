# Crypto Tracker — Wallet Intelligence System

Track top-performing on-chain wallets, score them by historical performance,
monitor their trades in real time, and receive Telegram alerts.

**Mode: Alert-only.** No automated trading. `ExecutionService` is stubbed.

---

## Architecture

```
crypto-tracker/
├── src/                    # Monitor service (Node.js)
│   ├── services/
│   │   ├── chain/
│   │   │   ├── IChainAdapter.ts        # Chain adapter interface
│   │   │   └── SolanaAdapter.ts        # Helius enhanced API + RPC fallback
│   │   ├── TokenInfoService.ts         # DexScreener + Birdeye (cached)
│   │   ├── TransactionParser.ts        # Swap → Trade + FIFO PnL pairing
│   │   ├── WalletScorer.ts             # 0-100 scoring engine
│   │   ├── RiskEngine.ts               # Risk flag detection
│   │   ├── TelegramService.ts          # Alert formatting + delivery
│   │   ├── AlertService.ts             # Orchestration: score→risk→alert
│   │   ├── ExecutionService.ts         # STUB — disabled intentionally
│   │   └── WalletMonitor.ts            # Polling loop (30s per wallet)
│   └── monitor/index.ts                # Entry point
├── dashboard/              # Next.js 14 dashboard
│   └── src/app/
│       ├── page.tsx                    # Overview
│       ├── wallets/page.tsx            # Leaderboard
│       ├── wallets/[address]/page.tsx  # Wallet detail + score breakdown
│       ├── trades/page.tsx             # Trade feed
│       └── alerts/page.tsx             # Alert history
├── prisma/schema.prisma    # Database schema
├── tests/                  # Unit tests
└── docker-compose.yml
```

## Scoring Model (0–100)

| Component       | Weight | Description |
|-----------------|--------|-------------|
| Realized PnL    | 25%    | Log-scale: $0→0, $10k→16, $100k→24, $1M→32 |
| Win Rate        | 20%    | % winning trades, confidence-weighted by trade count |
| Median ROI      | 20%    | Log-scale per-trade ROI |
| Drawdown        | 10%    | Max peak-to-trough drawdown |
| Consistency     | 10%    | Performance across 7d/30d/90d windows |
| Hold Time       | 10%    | Prefers 1h–14d; penalizes <30min flips |
| Liquidity       | 5%     | Average token liquidity quality |

**Penalties:**
- One-hit-wonder (<5 trades, high PnL): −20
- Illiquid trader (avg liquidity <$50k): −15
- Inactive (no trades in 30d): −10
- Too few trades (<5): −15

## Setup

### Prerequisites
- Node.js ≥ 20
- PostgreSQL 16 (or Docker)
- API keys (Helius recommended; DexScreener needs no key)

### 1. Install dependencies

```bash
cd crypto-tracker
npm install

cd dashboard
npm install
cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your keys
```

**Required:**
- `DATABASE_URL` — PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_CHAT_ID` — your Telegram chat/channel ID

**Recommended:**
- `HELIUS_API_KEY` — free tier at helius.dev (much better than public RPC)

**Optional:**
- `BIRDEYE_API_KEY` — for holder concentration data

### 3. Start the database

```bash
# With Docker:
docker compose up -d postgres

# Or use any PostgreSQL 16 instance
```

### 4. Run migrations

```bash
npm run db:migrate
```

### 5. Add wallets to track

```bash
# Add by address (optionally with a label)
npm run wallet:add 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM "SOL Whale"
npm run wallet:add AbcDef... "DeFi Alpha"

# List tracked wallets
npm run wallet:list

# Remove (archives, preserves history)
npm run wallet:remove <address>
```

### 6. Start monitoring

```bash
npm run monitor
```

### 7. Start the dashboard (separate terminal)

```bash
cd dashboard
npm run dev
# Open http://localhost:3000
```

---

## Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the token → set `TELEGRAM_BOT_TOKEN` in `.env`
3. Send any message to your bot
4. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Find `chat.id` in the response → set `TELEGRAM_CHAT_ID`

**Alert format:**
```
🟡 WHALE ALERT — Score: 72/100

👛 Wallet: SOL Whale (abc…xyz)
📊 Win Rate: 68% | Total PnL: +$45.2k

📈 BUY — $BONK
├ Amount: $1,200 (240M tokens)
├ Price: $0.000005
├ Liquidity: $2.4M | MCap: $580M
└ Source: JUPITER

⚠️ Risk Flags:
• New Token — Token is 18min old

🔗 View TX on Solscan
📂 View Wallet

💡 Confidence: MEDIUM — Worth Watching
```

---

## Data Sources

| Source | Auth | Used For |
|--------|------|----------|
| Helius | API key (free tier) | Enhanced Solana transaction parsing |
| DexScreener | None | Token prices, liquidity, market cap |
| Birdeye | API key (optional) | Holder concentration, token security |
| Solana RPC | None | Fallback when no Helius key |

---

## Docker Compose (full stack)

```bash
# Start just the database:
docker compose up -d postgres

# Start database + monitor:
docker compose --profile monitor up -d

# Start everything:
docker compose --profile monitor --profile dashboard up -d
```

---

## Adding Ethereum/Base Support

1. Implement `src/services/chain/EthereumAdapter.ts` (see `IChainAdapter` interface)
2. Register it in `src/monitor/index.ts`:
   ```typescript
   registry.register(new EthereumAdapter(config.ethRpcUrl, config.etherscanKey));
   ```
3. Add wallets with `chain: "ETHEREUM"` via the dashboard or CLI

The scoring, risk, and alert systems are chain-agnostic.

---

## Enabling Copy Trading (future)

See `src/services/ExecutionService.ts` — it's a fully-defined interface that is
intentionally stubbed. When ready:
1. Implement the `executeCopyTrade` method with Jupiter swap integration
2. Add position sizing, slippage protection, and daily loss limits
3. Wire up in `AlertService.handleNewTrade` after the risk check

**Never enable execution without maximum loss limits.**

---

## Running Tests

```bash
npm test
```

Tests cover the scoring math and PnL calculation logic in isolation (no DB required).
