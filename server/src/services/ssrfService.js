import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { config } from '../config/index.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254'
]);

/**
 * Validates whether an IP address is considered safe for outbound delivery.
 */
export function isIpSafe(ipStr, allowLocal = false) {
  if (allowLocal) return true;

  try {
    if (!ipaddr.isValid(ipStr)) {
      return false;
    }

    let addr = ipaddr.parse(ipStr);

    // If it's an IPv4-mapped IPv6 address (e.g., ::ffff:127.0.0.1), unmap it
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }

    const range = addr.range();

    // Block non-public IP ranges
    const unsafeRanges = new Set([
      'unspecified',
      'broadcast',
      'linkLocal',
      'loopback',
      'carrierGradeNat',
      'private',
      'reserved',
      'multicast',
      'uniqueLocal',
      'rfc6145',
      'rfc6052',
      '6to4',
      'teredo'
    ]);

    if (unsafeRanges.has(range)) {
      return false;
    }

    // Explicit check for cloud metadata 169.254.169.254
    if (addr.toString() === '169.254.169.254') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a destination URL against SSRF rules.
 * Resolves hostnames and validates all resolved IP addresses.
 *
 * @param {string} destinationUrl
 * @param {boolean} [allowLocal]
 * @returns {Promise<{ valid: boolean, error?: string, parsedUrl?: URL, resolvedIps?: string[] }>}
 */
export async function validateDestinationUrl(destinationUrl, allowLocal = config.security.allowLocalDestinations) {
  if (!destinationUrl || typeof destinationUrl !== 'string') {
    return { valid: false, error: 'Destination URL is required and must be a string' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(destinationUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only http and https protocols permitted
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { valid: false, error: `Protocol "${parsedUrl.protocol}" is not allowed. Only http: and https: are supported.` };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Basic hostname check
  if (!allowLocal) {
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
      return { valid: false, error: `Hostname "${hostname}" is blocked for security reasons.` };
    }
  }

  // If the hostname itself is an IP address
  if (ipaddr.isValid(hostname)) {
    if (!isIpSafe(hostname, allowLocal)) {
      return { valid: false, error: `IP address "${hostname}" is in a private, loopback, or reserved range.` };
    }
    return { valid: true, parsedUrl, resolvedIps: [hostname] };
  }

  // Resolve hostname via DNS and check all resolved IP addresses
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { valid: false, error: `Could not resolve hostname "${hostname}".` };
    }

    const resolvedIps = addresses.map((a) => a.address);

    for (const ip of resolvedIps) {
      if (!isIpSafe(ip, allowLocal)) {
        return { valid: false, error: `Resolved IP address "${ip}" for host "${hostname}" is blocked.` };
      }
    }

    return { valid: true, parsedUrl, resolvedIps };
  } catch (err) {
    return { valid: false, error: `DNS resolution failed for "${hostname}": ${err.message}` };
  }
}
