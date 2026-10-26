import crypto from 'node:crypto';

/**
 * Generate a cryptographically secure random ID with a prefix.
 * Example: ep_a8f3b..., evt_9c12e..., att_4d77a...
 */
export function generateId(prefix = '') {
  const bytes = crypto.randomBytes(12).toString('hex');
  return prefix ? `${prefix}_${bytes}` : bytes;
}
