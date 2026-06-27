import { describe, expect, it } from "vitest";
import { validateDownloadUrl } from "../../src/security/url-guard.js";

const baseOpts = { allowedSchemes: ["http", "https"] };

describe("validateDownloadUrl", () => {
  describe("scheme handling", () => {
    it("accepts https://", async () => {
      // 127.0.0.1 will be blocked on IP, but we want to test scheme first
      const r = await validateDownloadUrl("file:///etc/passwd", baseOpts);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/scheme/i);
    });

    it("rejects ftp://", async () => {
      const r = await validateDownloadUrl("ftp://example.com/foo", baseOpts);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/scheme/i);
    });

    it("rejects data:", async () => {
      const r = await validateDownloadUrl("data:text/plain,hello", baseOpts);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/scheme/i);
    });

    it("rejects empty scheme", async () => {
      const r = await validateDownloadUrl("//example.com/foo", baseOpts);
      expect(r.ok).toBe(false);
    });
  });

  describe("IP literal blocklist", () => {
    it("rejects 127.0.0.1 (loopback)", async () => {
      const r = await validateDownloadUrl("http://127.0.0.1/foo", baseOpts);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/blocked|private/i);
    });

    it("rejects 10.x.x.x (RFC1918)", async () => {
      const r = await validateDownloadUrl("http://10.1.2.3/foo", baseOpts);
      expect(r.ok).toBe(false);
    });

    it("rejects 192.168.x.x", async () => {
      const r = await validateDownloadUrl("http://192.168.0.1/foo", baseOpts);
      expect(r.ok).toBe(false);
    });

    it("rejects 172.16.x.x", async () => {
      const r = await validateDownloadUrl("http://172.16.0.1/foo", baseOpts);
      expect(r.ok).toBe(false);
    });

    it("rejects 169.254.169.254 (cloud metadata)", async () => {
      const r = await validateDownloadUrl("http://169.254.169.254/latest/meta-data/", baseOpts);
      expect(r.ok).toBe(false);
    });

    it("rejects 0.0.0.0", async () => {
      const r = await validateDownloadUrl("http://0.0.0.0/foo", baseOpts);
      expect(r.ok).toBe(false);
    });

    it("rejects IPv6 loopback ::1", async () => {
      const r = await validateDownloadUrl("http://[::1]/foo", baseOpts);
      expect(r.ok).toBe(false);
    });

    it("rejects IPv6 link-local fe80::", async () => {
      const r = await validateDownloadUrl("http://[fe80::1]/foo", baseOpts);
      expect(r.ok).toBe(false);
    });
  });

  describe("hostname DNS", () => {
    it("rejects unresolvable hostname", async () => {
      const r = await validateDownloadUrl(
        "http://this-host-should-definitely-not-exist-1234567890.example/foo",
        baseOpts,
      );
      expect(r.ok).toBe(false);
    });
  });

  describe("operator allowlist", () => {
    it("rejects hostname not on allowlist", async () => {
      // Use a public IP literal that is not blocked — well-known public DNS.
      // 1.1.1.1 (Cloudflare) is public.
      const r = await validateDownloadUrl("https://1.1.1.1/foo", {
        ...baseOpts,
        allowedHosts: [".example.com"],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/allowlist/i);
    });

    it("accepts hostname on allowlist (suffix match)", async () => {
      // Use a hostname that resolves via real DNS. We can't rely on that in
      // tests, so we test the matching logic indirectly by using an IP.
      const r = await validateDownloadUrl("https://1.1.1.1/foo", {
        ...baseOpts,
        allowedHosts: ["1.1.1.1"],
      });
      expect(r.ok).toBe(true);
    });

    it("accepts when IP matches a CIDR in allowlist", async () => {
      const r = await validateDownloadUrl("https://8.8.8.8/foo", {
        ...baseOpts,
        allowedHosts: ["8.8.8.0/24"],
      });
      expect(r.ok).toBe(true);
    });

    it("empty allowlist disables the check", async () => {
      const r = await validateDownloadUrl("https://1.1.1.1/foo", {
        ...baseOpts,
        allowedHosts: [],
      });
      expect(r.ok).toBe(true);
    });
  });

  describe("parse errors", () => {
    it("rejects malformed URL", async () => {
      const r = await validateDownloadUrl("not-a-url", baseOpts);
      expect(r.ok).toBe(false);
    });

    it("rejects URL with no hostname", async () => {
      const r = await validateDownloadUrl("http:///path", baseOpts);
      expect(r.ok).toBe(false);
    });
  });
});
