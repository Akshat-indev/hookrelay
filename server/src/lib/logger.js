const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = process.env.NODE_ENV === 'test' ? 'error' : (process.env.LOG_LEVEL || 'info');

function shouldLog(level) {
  return LOG_LEVELS[level] >= (LOG_LEVELS[currentLevel] ?? 1);
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  debug(message, meta) {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, meta));
  },
  info(message, meta) {
    if (shouldLog('info')) console.info(formatMessage('info', message, meta));
  },
  warn(message, meta) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, meta));
  },
  error(message, meta) {
    if (shouldLog('error')) console.error(formatMessage('error', message, meta));
  }
};
