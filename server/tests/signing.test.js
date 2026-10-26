import { describe, it, expect } from 'vitest';
import { generateSigningSecret, generateSignature, verifySignature } from '../src/lib/crypto.js';

describe('Webhook Signing & Verification', () => {
  it('generates a cryptographically secure signing secret with whsec_ prefix', () => {
    const secret = generateSigningSecret();
    expect(secret).toMatch(/^whsec_[a-f0-9]{64}$/);
  });

  it('generates HMAC-SHA256 signature in sha256=<hex> format', () => {
    const secret = generateSigningSecret();
    const payload = JSON.stringify({ event_id: 'evt_1', type: 'order.created' });
    const signature = generateSignature(payload, secret);

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('verifies signature correctly against exact serialized body', () => {
    const secret = generateSigningSecret();
    const payload = JSON.stringify({ id: 123, name: 'Alice' });
    const signature = generateSignature(payload, secret);

    const isValid = verifySignature(payload, signature, secret);
    expect(isValid).toBe(true);
  });

  it('rejects tampered or modified payload bytes', () => {
    const secret = generateSigningSecret();
    const original = JSON.stringify({ amount: 100 });
    const tampered = JSON.stringify({ amount: 999 });
    const signature = generateSignature(original, secret);

    const isValid = verifySignature(tampered, signature, secret);
    expect(isValid).toBe(false);
  });

  it('rejects tampered signature', () => {
    const secret = generateSigningSecret();
    const payload = JSON.stringify({ amount: 100 });
    const fakeSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

    const isValid = verifySignature(payload, fakeSignature, secret);
    expect(isValid).toBe(false);
  });

  it('throws error when generating signature without a secret', () => {
    expect(() => generateSignature('payload', null)).toThrow('Signing secret is required');
  });

  it('returns false for missing or malformed inputs in verification', () => {
    expect(verifySignature('payload', null, 'secret')).toBe(false);
    expect(verifySignature('payload', 'sha256=123', null)).toBe(false);
    expect(verifySignature('payload', 'invalid-format', 'secret')).toBe(false);
  });
});
