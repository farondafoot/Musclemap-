#!/usr/bin/env ts-node
import "dotenv/config";
import { prisma } from "@/db/client";
import { WalletScorer } from "@/services/WalletScorer";
import { WalletStatus } from "@prisma/client";

async function main() {
  const scorer = new WalletScorer();

  const wallets = await prisma.trackedWallet.findMany({
    where: { status: WalletStatus.ACTIVE },
    select: { id: true, address: true, label: true },
    orderBy: { address: "asc" },
  });

  console.log(`\nRecalculating scores for ${wallets.length} wallets…\n`);

  for (const wallet of wallets) {
    try {
      const score = await scorer.scoreWallet(wallet.id);
      const label = wallet.label ?? "(unlabeled)";
      console.log(`  ✅ ${wallet.address.slice(0, 8)}… "${label}" → ${score.toFixed(1)}/100`);
    } catch (err) {
      console.error(`  ❌ ${wallet.address.slice(0, 8)}… failed:`, err);
    }
  }

  console.log("\nDone.\n");
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
