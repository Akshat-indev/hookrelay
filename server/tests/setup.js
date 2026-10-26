import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { getPrismaClient } from '../src/db/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.ALLOW_LOCAL_DESTINATIONS = 'true';
process.env.LOG_LEVEL = 'error';

let prisma;

beforeAll(async () => {
  // Push Prisma schema into isolated test.db
  try {
    execSync('npx prisma db push --accept-data-loss --skip-generate', {
      cwd: serverDir,
      env: {
        ...process.env,
        DATABASE_URL: 'file:./test.db'
      },
      stdio: 'pipe'
    });
  } catch (err) {
    console.error('Failed to initialize test database:', err.message);
  }

  prisma = getPrismaClient();
});

beforeEach(async () => {
  if (prisma) {
    // Clear data between tests to ensure clean state
    await prisma.deliveryAttempt.deleteMany();
    await prisma.event.deleteMany();
    await prisma.endpoint.deleteMany();
    await prisma.workerHeartbeat.deleteMany();
  }
});

afterAll(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
});
