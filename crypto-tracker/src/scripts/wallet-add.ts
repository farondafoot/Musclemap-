#!/usr/bin/env ts-node
import "dotenv/config";
import { prisma } from "@/db/client";
import { Chain, WalletStatus } from "@prisma/client";

async function main() {
  const [, , address, label, source] = process.argv;

  if (!address) {
    console.error("Usage: npm run wallet:add <address> [label] [source]");
    process.exit(1);
  }

  // Minimal Solana address validation
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    console.error("Error: invalid Solana address format");
    process.exit(1);
  }

  const wallet = await prisma.trackedWallet.upsert({
    where: { address_chain: { address, chain: Chain.SOLANA } },
    create: {
      address,
      chain: Chain.SOLANA,
      label: label ?? null,
      source: source ?? "manual",
      status: WalletStatus.ACTIVE,
    },
    update: {
      status: WalletStatus.ACTIVE,
      label: label ?? undefined,
    },
  });

  console.log(`✅ Wallet added: ${wallet.address} (${wallet.label ?? "unlabeled"})`);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
