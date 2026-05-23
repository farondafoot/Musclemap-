import TelegramBot from "node-telegram-bot-api";
import { prisma } from "@/db/client";
import type { TradeAlertPayload } from "@/types";
import { TradeAction, RiskLevel } from "@prisma/client";
import { logger } from "@/utils/logger";

const SOLSCAN_TX = (hash: string) => `https://solscan.io/tx/${hash}`;
const SOLSCAN_ADDR = (addr: string) => `https://solscan.io/account/${addr}`;

const RISK_EMOJI: Record<RiskLevel, string> = {
  LOW: "🟢",
  MEDIUM: "🟡",
  HIGH: "🟠",
  CRITICAL: "🔴",
};

const ACTION_EMOJI: Record<TradeAction, string> = {
  BUY: "📈",
  SELL: "📉",
};

export class TelegramService {
  private bot: TelegramBot | null = null;
  private chatId: string | null = null;

  constructor(botToken?: string, chatId?: string) {
    if (botToken && chatId) {
      this.bot = new TelegramBot(botToken, { polling: false });
      this.chatId = chatId;
      logger.info("TelegramService: initialized");
    } else {
      logger.warn("TelegramService: no bot token/chat ID — alerts will be logged only");
    }
  }

  get isConfigured(): boolean {
    return this.bot !== null && this.chatId !== null;
  }

  async sendTradeAlert(payload: TradeAlertPayload, alertId: string): Promise<void> {
    const message = this.formatTradeAlert(payload);

    if (!this.bot || !this.chatId) {
      logger.info("TELEGRAM ALERT (not sent — no bot configured):\n" + message);
      return;
    }

    try {
      const sent = await this.bot.sendMessage(this.chatId, message, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

      await prisma.alert.update({
        where: { id: alertId },
        data: {
          sent: true,
          sentAt: new Date(),
          telegramMsgId: sent.message_id,
        },
      });

      logger.info("TelegramService: alert sent", { alertId, msgId: sent.message_id });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("TelegramService: send failed", { alertId, err: errMsg });

      await prisma.alert.update({
        where: { id: alertId },
        data: { sendError: errMsg },
      }).catch(() => {});
    }
  }

  async sendText(text: string): Promise<void> {
    if (!this.bot || !this.chatId) return;
    try {
      await this.bot.sendMessage(this.chatId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.error("TelegramService: sendText failed", { err });
    }
  }

  // ── Message formatting ────────────────────────────────────────────────────

  private formatTradeAlert(p: TradeAlertPayload): string {
    const { wallet, trade, token, risk } = p;
    const riskEmoji = RISK_EMOJI[risk.level];
    const actionEmoji = ACTION_EMOJI[trade.action];
    const actionWord = trade.action === TradeAction.BUY ? "BUY" : "SELL";

    const walletLabel = wallet.label
      ? `<b>${escHtml(wallet.label)}</b> (<code>${shortAddr(wallet.address)}</code>)`
      : `<code>${shortAddr(wallet.address)}</code>`;

    const tokenStr = trade.tokenSymbol
      ? `<b>$${escHtml(trade.tokenSymbol)}</b>`
      : `<code>${shortAddr(trade.tokenAddress)}</code>`;

    const valueStr = trade.valueUsd != null ? `$${fmtUsd(trade.valueUsd)}` : "unknown USD";
    const tokenAmtStr = fmtAmount(trade.tokenAmount);

    const liqStr = token.liquidityUsd != null ? `$${fmtUsd(token.liquidityUsd)}` : "—";
    const mcapStr = token.marketCapUsd != null ? `$${fmtUsd(token.marketCapUsd)}` : "—";
    const ageStr = token.tokenAgeMinutes != null ? fmtAge(token.tokenAgeMinutes) : "—";

    const scoreStr = wallet.score.toFixed(0);
    const winRateStr = (wallet.winRate * 100).toFixed(0);
    const pnlStr = wallet.totalPnl >= 0
      ? `+$${fmtUsd(wallet.totalPnl)}`
      : `-$${fmtUsd(Math.abs(wallet.totalPnl))}`;

    const confidence = this.suggestConfidence(wallet.score, risk.level);

    let msg = `${riskEmoji} <b>WHALE ALERT</b> — Score: <b>${scoreStr}/100</b>\n\n`;
    msg += `👛 Wallet: ${walletLabel}\n`;
    msg += `📊 Win Rate: ${winRateStr}% | Total PnL: ${pnlStr}\n\n`;

    msg += `${actionEmoji} <b>${actionWord}</b> — ${tokenStr}\n`;
    msg += `├ Amount: ${valueStr} (${tokenAmtStr} tokens)\n`;

    if (trade.priceUsd != null) {
      msg += `├ Price: $${trade.priceUsd.toPrecision(4)}\n`;
    }

    msg += `├ Liquidity: ${liqStr} | MCap: ${mcapStr}\n`;
    msg += `├ Token Age: ${ageStr}\n`;
    msg += `└ Source: ${trade.source ?? "DEX"}\n\n`;

    if (risk.flags.length > 0) {
      msg += `⚠️ <b>Risk Flags</b>:\n`;
      for (const flag of risk.flags) {
        const detail = risk.details[flag];
        msg += `• ${formatFlag(flag)}${detail ? ` — ${escHtml(detail)}` : ""}\n`;
      }
      msg += "\n";
    }

    msg += `🔗 <a href="${SOLSCAN_TX(trade.txHash)}">View TX on Solscan</a>\n`;
    msg += `📂 <a href="${SOLSCAN_ADDR(wallet.address)}">View Wallet</a>\n\n`;
    msg += `💡 Confidence: <b>${confidence}</b>`;

    return msg;
  }

  private suggestConfidence(score: number, riskLevel: RiskLevel): string {
    if (riskLevel === RiskLevel.CRITICAL) return "DO NOT COPY — Critical Risk";
    if (riskLevel === RiskLevel.HIGH) return "SKIP — High Risk";
    if (score >= 80 && riskLevel === RiskLevel.LOW) return "HIGH — Strong Signal";
    if (score >= 65) return "MEDIUM — Worth Watching";
    if (score >= 50) return "LOW — Informational";
    return "VERY LOW — Weak Signal";
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}

function fmtAmount(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(2);
}

function fmtAge(minutes: number): string {
  if (minutes < 60) return `${minutes.toFixed(0)}min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function formatFlag(flag: string): string {
  return flag
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}
