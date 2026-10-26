import crypto from 'node:crypto';

/**
 * Generate a cryptographically secure webhook signing secret.
 * Format: whsec_<64 hex chars>
 */
export function generateSigningSecret() {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Generate HMAC-SHA256 signature for a payload.
 * Returns: sha256=<hex_digest>
 */
export function generateSignature(payloadString, secret) {
  if (!secret) {
    throw new Error('Signing secret is required');
  }
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString, 'utf8');
  const digest = hmac.digest('hex');
  return `sha256=${digest}`;
}

/**
 * Verify HMAC-SHA256 signature using constant-time comparison.
 */
export function verifySignature(payloadString, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }
  const expectedSignature = generateSignature(payloadString, secret);
  try {
    const headerBuf = Buffer.from(signatureHeader, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (headerBuf.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(headerBuf, expectedBuf);
  } catch {
    return false;
  }
}
