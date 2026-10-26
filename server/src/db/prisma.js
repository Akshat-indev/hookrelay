import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger.js';

let prisma;

export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.DEBUG_PRISMA === 'true' ? ['query', 'info', 'warn', 'error'] : ['error']
    });

    // Configure SQLite WAL mode and busy timeout for concurrent safety
    // Note: In SQLite, PRAGMAs that return results must use $queryRawUnsafe
    prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;')
      .catch((err) => logger.warn(`Failed to set SQLite journal_mode=WAL: ${err.message}`));
    prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;')
      .catch((err) => logger.warn(`Failed to set SQLite busy_timeout: ${err.message}`));
  }
  return prisma;
}

export { prisma };
