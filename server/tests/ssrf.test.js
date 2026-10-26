import { describe, it, expect } from 'vitest';
import { validateDestinationUrl, isIpSafe } from '../src/services/ssrfService.js';

describe('SSRF Protection & URL Validation', () => {
  describe('isIpSafe', () => {
    it('rejects loopback IPv4 addresses', () => {
      expect(isIpSafe('127.0.0.1', false)).toBe(false);
      expect(isIpSafe('127.1.2.3', false)).toBe(false);
    });

    it('rejects private IPv4 ranges (RFC 1918)', () => {
      expect(isIpSafe('10.0.0.1', false)).toBe(false);
      expect(isIpSafe('10.254.254.254', false)).toBe(false);
      expect(isIpSafe('172.16.0.1', false)).toBe(false);
      expect(isIpSafe('172.31.255.255', false)).toBe(false);
      expect(isIpSafe('192.168.1.1', false)).toBe(false);
    });

    it('rejects link-local and cloud metadata (169.254.169.254)', () => {
      expect(isIpSafe('169.254.169.254', false)).toBe(false);
      expect(isIpSafe('169.254.0.1', false)).toBe(false);
    });

    it('rejects IPv6 loopback (::1) and unspecified (::)', () => {
      expect(isIpSafe('::1', false)).toBe(false);
      expect(isIpSafe('::', false)).toBe(false);
    });

    it('allows valid public unicast IPv4 addresses', () => {
      expect(isIpSafe('8.8.8.8', false)).toBe(true);
      expect(isIpSafe('93.184.216.34', false)).toBe(true);
    });

    it('permits loopback and private IPs when allowLocal is explicitly true', () => {
      expect(isIpSafe('127.0.0.1', true)).toBe(true);
      expect(isIpSafe('192.168.1.1', true)).toBe(true);
    });
  });

  describe('validateDestinationUrl', () => {
    it('rejects malformed or empty URLs', async () => {
      const res1 = await validateDestinationUrl('');
      expect(res1.valid).toBe(false);

      const res2 = await validateDestinationUrl('not-a-valid-url');
      expect(res2.valid).toBe(false);
    });

    it('rejects non-HTTP protocols such as ftp, file, javascript', async () => {
      const res1 = await validateDestinationUrl('ftp://example.com/webhook');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Only http: and https: are supported');

      const res2 = await validateDestinationUrl('file:///etc/passwd');
      expect(res2.valid).toBe(false);
    });

    it('rejects localhost and cloud metadata hostnames when allowLocal is false', async () => {
      const res1 = await validateDestinationUrl('http://localhost:3000/hook', false);
      expect(res1.valid).toBe(false);

      const res2 = await validateDestinationUrl('http://169.254.169.254/latest/meta-data', false);
      expect(res2.valid).toBe(false);

      const res3 = await validateDestinationUrl('http://metadata.google.internal/computeMetadata', false);
      expect(res3.valid).toBe(false);
    });

    it('allows local URLs when allowLocal is true', async () => {
      const res = await validateDestinationUrl('http://localhost:3000/webhook', true);
      expect(res.valid).toBe(true);
      expect(res.parsedUrl.protocol).toBe('http:');
    });
  });
});
