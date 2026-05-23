import { PrismaClient } from "@prisma/client";
import { logger } from "@/utils/logger";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env.LOG_LEVEL === "debug"
        ? ["query", "info", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export async function connectDb(): Promise<void> {
  await prisma.$connect();
  logger.info("Database connected");
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  logger.info("Database disconnected");
}
