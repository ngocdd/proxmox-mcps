/**
 * SSRF guard for server-side URL fetches (e.g. `download_iso`).
 *
 * Rejects URLs whose scheme is not allowed, whose hostname resolves to a
 * private/loopback/link-local IP, or whose hostname is not on the operator's
 * allowlist (when configured).
 *
 * Used by tools that hand a URL to the Proxmox REST API (`/download-url`,
 * etc.). Proxmox performs the fetch server-side, so an unguarded URL turns
 * the Proxmox host into an SSRF proxy from the management network.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface DownloadGuardOptions {
  /** Allowed URL schemes (lowercase, e.g. "http", "https"). */
  allowedSchemes: ReadonlyArray<string>;
  /** Optional operator allowlist of hostnames (suffix match) or CIDRs. */
  allowedHosts?: ReadonlyArray<string>;
}

export type GuardResult = { ok: true; resolvedIp: string } | { ok: false; reason: string };

// RFC1918 / RFC4193 / RFC5735 / RFC6890 ranges that must never be reached
// from a server-side fetch by an LLM-driven tool caller.
const BLOCKED_V4_CIDRS: ReadonlyArray<[string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["0.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

const BLOCKED_V6_PREFIXES: ReadonlyArray<string> = ["::1", "fc", "fd", "fe80", "ff"]; // loopback, ULA, link-local, multicast

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (
    parts.length !== 4 ||
    parts.some((p) => p === undefined || Number.isNaN(p) || p < 0 || p > 255)
  ) {
    return -1;
  }
  const a = parts[0] as number;
  const b = parts[1] as number;
  const c = parts[2] as number;
  const d = parts[3] as number;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function ipv4InCidr(ip: string, base: string, bits: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt < 0 || baseInt < 0) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipv4Blocked(ip: string): boolean {
  return BLOCKED_V4_CIDRS.some(([base, bits]) => ipv4InCidr(ip, base, bits));
}

function ipv6Blocked(ip: string): boolean {
  const lower = ip.toLowerCase();
  // Normalize ::1 and 0:0:0:0:0:0:0:1 to ::1
  if (lower === "::" || lower === "::1") return true;
  for (const prefix of BLOCKED_V6_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

function ipBlocked(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Blocked(ip);
  if (v === 6) return ipv6Blocked(ip);
  return true; // unknown family — block
}

function cidrMatchesIp(cidr: string, ip: string): boolean {
  if (!cidr.includes("/")) return false;
  const parts = cidr.split("/", 2);
  const base = parts[0] ?? "";
  const bitsStr = parts[1] ?? "";
  const bits = Number.parseInt(bitsStr, 10);
  if (Number.isNaN(bits)) return false;
  if (isIP(base) === 4 && isIP(ip) === 4 && bits >= 0 && bits <= 32) {
    return ipv4InCidr(ip, base, bits);
  }
  // Simple IPv6 prefix match
  if (isIP(base) === 6 && isIP(ip) === 6 && bits >= 0 && bits <= 128) {
    const norm = (s: string): string => s.toLowerCase().replace(/^0+/, "");
    const len = Math.max(1, Math.floor(bits / 4) * 2);
    return norm(ip).startsWith(norm(base).slice(0, len));
  }
  return false;
}

function hostMatchesAllowlist(host: string, ip: string, allowlist: ReadonlyArray<string>): boolean {
  const lower = host.toLowerCase();
  for (const entryRaw of allowlist) {
    const entry = entryRaw.trim().toLowerCase();
    if (!entry) continue;
    // Exact match
    if (entry === lower) return true;
    // Suffix match (".example.com" matches "foo.example.com" but not "example.com")
    if (entry.startsWith(".") && lower.endsWith(entry)) return true;
    // CIDR
    if (entry.includes("/") && cidrMatchesIp(entry, ip)) return true;
    // Bare IP
    if (entry === ip) return true;
  }
  return false;
}

/**
 * Validate a URL for safe server-side fetching.
 *
 * Returns `{ ok: true, resolvedIp }` on success, or `{ ok: false, reason }`
 * explaining why the URL was rejected. `reason` is safe to surface to the
 * model (no internal details).
 */
export async function validateDownloadUrl(
  rawUrl: string,
  opts: DownloadGuardOptions,
): Promise<GuardResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL is not parseable" };
  }

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (!opts.allowedSchemes.includes(scheme)) {
    return {
      ok: false,
      reason: `scheme '${scheme || "<empty>"}' is not allowed (permitted: ${opts.allowedSchemes.join(", ")})`,
    };
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return { ok: false, reason: "URL has no hostname" };
  }

  // If hostname is a literal IP, validate it directly without DNS lookup.
  let resolvedIp: string;
  if (isIP(hostname)) {
    resolvedIp = hostname;
  } else {
    try {
      const addrs = await lookup(hostname, { all: true });
      if (addrs.length === 0) {
        return { ok: false, reason: "hostname did not resolve" };
      }
      resolvedIp = addrs[0]?.address ?? hostname;
    } catch {
      return { ok: false, reason: "hostname DNS lookup failed" };
    }
  }

  if (ipBlocked(resolvedIp)) {
    return { ok: false, reason: "URL resolves to a blocked (private/loopback/link-local) IP range" };
  }

  if (opts.allowedHosts && opts.allowedHosts.length > 0) {
    if (!hostMatchesAllowlist(hostname, resolvedIp, opts.allowedHosts)) {
      return { ok: false, reason: "hostname is not on the operator allowlist" };
    }
  }

  return { ok: true, resolvedIp };
}
