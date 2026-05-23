#!/usr/bin/env ts-node
import "dotenv/config";
import { prisma } from "@/db/client";
import { Chain, WalletStatus } from "@prisma/client";

async function main() {
  const [, , address] = process.argv;
  if (!address) {
    console.error("Usage: npm run wallet:remove <address>");
    process.exit(1);
  }

  const wallet = await prisma.trackedWallet.findUnique({
    where: { address_chain: { address, chain: Chain.SOLANA } },
  });

  if (!wallet) {
    console.error(`Wallet not found: ${address}`);
    process.exit(1);
  }

  // Soft-delete (archive) to preserve trade history
  await prisma.trackedWallet.update({
    where: { id: wallet.id },
    data: { status: WalletStatus.ARCHIVED },
  });

  console.log(`✅ Wallet archived: ${address} (trade history preserved)`);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
