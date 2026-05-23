#!/usr/bin/env ts-node
import "dotenv/config";
import { prisma } from "@/db/client";

async function main() {
  const wallets = await prisma.trackedWallet.findMany({
    orderBy: { score: "desc" },
    include: {
      _count: { select: { trades: true } },
    },
  });

  if (!wallets.length) {
    console.log("No wallets tracked yet. Use: npm run wallet:add <address>");
    return;
  }

  console.log("\n" + "─".repeat(90));
  console.log(
    "Score".padEnd(8) + "Label".padEnd(24) + "Address".padEnd(48) + "Trades".padEnd(8) + "Status"
  );
  console.log("─".repeat(90));

  for (const w of wallets) {
    const score = w.score.toFixed(1).padEnd(8);
    const label = (w.label ?? "(unlabeled)").slice(0, 22).padEnd(24);
    const addr = `${w.address.slice(0, 8)}…${w.address.slice(-8)}`.padEnd(48);
    const trades = String(w._count.trades).padEnd(8);
    console.log(`${score}${label}${addr}${trades}${w.status}`);
  }

  console.log("─".repeat(90));
  console.log(`Total: ${wallets.length} wallet(s)\n`);

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
