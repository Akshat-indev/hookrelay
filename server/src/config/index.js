import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  
  worker: {
    pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000', 10),
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '10', 10),
    leaseTimeoutMs: parseInt(process.env.WORKER_LEASE_TIMEOUT_MS || '60000', 10),
    deliveryTimeoutMs: parseInt(process.env.DELIVERY_TIMEOUT_MS || '10000', 10),
    maxResponseBodyBytes: parseInt(process.env.MAX_RESPONSE_BODY_BYTES || '8192', 10),
    initialRetryDelayMs: parseInt(process.env.INITIAL_RETRY_DELAY_MS || '2000', 10),
    maxRetryDelayMs: parseInt(process.env.MAX_RETRY_DELAY_MS || '300000', 10),
  },

  security: {
    allowLocalDestinations: process.env.ALLOW_LOCAL_DESTINATIONS === 'true' || process.env.NODE_ENV === 'test',
    maxPayloadBytes: parseInt(process.env.MAX_PAYLOAD_BYTES || '1048576', 10), // 1MB
  }
};
