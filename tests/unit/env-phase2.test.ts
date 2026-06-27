import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

describe("parseEnv — Phase 2 env vars", () => {
  const baseEnv: Record<string, string> = {
    PROXMOX_HOST: "pve.example.com",
    PROXMOX_USER: "root@pam",
    PROXMOX_TOKEN_NAME: "mcp",
    PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
  };

  it("defaults MCP_TRANSPORT to STDIO", () => {
    const env = parseEnv(baseEnv);
    expect(env.MCP_TRANSPORT).toBe("STDIO");
    expect(env.MCP_HOST).toBe("127.0.0.1");
    expect(env.MCP_PORT).toBe(8000);
  });

  it("accepts MCP_TRANSPORT=STREAMABLE with custom port", () => {
    const env = parseEnv({
      ...baseEnv,
      MCP_TRANSPORT: "STREAMABLE",
      MCP_HOST: "0.0.0.0",
      MCP_PORT: "9000",
    });
    expect(env.MCP_TRANSPORT).toBe("STREAMABLE");
    expect(env.MCP_HOST).toBe("0.0.0.0");
    expect(env.MCP_PORT).toBe(9000);
  });

  it("accepts MCP_TRANSPORT=SSE", () => {
    const env = parseEnv({ ...baseEnv, MCP_TRANSPORT: "SSE" });
    expect(env.MCP_TRANSPORT).toBe("SSE");
  });

  it("rejects invalid MCP_TRANSPORT values", () => {
    expect(() =>
      parseEnv({ ...baseEnv, MCP_TRANSPORT: "WEBSOCKET" }),
    ).toThrow(/Invalid environment configuration/);
  });

  it("rejects invalid MCP_PORT", () => {
    expect(() => parseEnv({ ...baseEnv, MCP_PORT: "70000" })).toThrow();
    expect(() => parseEnv({ ...baseEnv, MCP_PORT: "0" })).toThrow();
  });

  it("defaults job store to memory", () => {
    const env = parseEnv(baseEnv);
    expect(env.PROXMOX_MCP_JOB_STORE).toBe("memory");
    expect(env.PROXMOX_MCP_JOB_SQLITE_PATH).toBe("./proxmox-jobs.sqlite3");
    expect(env.PROXMOX_MCP_JOB_TTL_HOURS).toBe(24);
  });

  it("accepts sqlite job store with custom path", () => {
    const env = parseEnv({
      ...baseEnv,
      PROXMOX_MCP_JOB_STORE: "sqlite",
      PROXMOX_MCP_JOB_SQLITE_PATH: "/var/lib/proxmox-mcps/jobs.db",
      PROXMOX_MCP_JOB_TTL_HOURS: "72",
    });
    expect(env.PROXMOX_MCP_JOB_STORE).toBe("sqlite");
    expect(env.PROXMOX_MCP_JOB_SQLITE_PATH).toBe("/var/lib/proxmox-mcps/jobs.db");
    expect(env.PROXMOX_MCP_JOB_TTL_HOURS).toBe(72);
  });

  it("rejects invalid job store values", () => {
    expect(() =>
      parseEnv({ ...baseEnv, PROXMOX_MCP_JOB_STORE: "redis" }),
    ).toThrow(/Invalid environment configuration/);
  });

  it("rejects JOB_TTL_HOURS out of range", () => {
    expect(() => parseEnv({ ...baseEnv, PROXMOX_MCP_JOB_TTL_HOURS: "0" })).toThrow();
    expect(() => parseEnv({ ...baseEnv, PROXMOX_MCP_JOB_TTL_HOURS: "999" })).toThrow();
  });

  it("accepts retry tuning", () => {
    const env = parseEnv({
      ...baseEnv,
      PROXMOX_MCP_RETRY_MAX: "5",
      PROXMOX_MCP_RETRY_BASE_MS: "500",
    });
    expect(env.PROXMOX_MCP_RETRY_MAX).toBe(5);
    expect(env.PROXMOX_MCP_RETRY_BASE_MS).toBe(500);
  });

  it("rejects RETRY_MAX > 10", () => {
    expect(() => parseEnv({ ...baseEnv, PROXMOX_MCP_RETRY_MAX: "20" })).toThrow();
  });
});

describe("parseEnv — Safety", () => {
  const baseEnv: Record<string, string> = {
    PROXMOX_HOST: "pve.example.com",
    PROXMOX_USER: "root@pam",
    PROXMOX_TOKEN_NAME: "mcp",
    PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
  };

  it("accepts approval_token of sufficient length", () => {
    const env = parseEnv({
      ...baseEnv,
      PROXMOX_MCP_APPROVAL_TOKEN: "abcdef1234567890abcdef1234567890",
    });
    expect(env.PROXMOX_MCP_APPROVAL_TOKEN).toBe("abcdef1234567890abcdef1234567890");
  });

  it("rejects approval_token shorter than 8 chars", () => {
    expect(() =>
      parseEnv({ ...baseEnv, PROXMOX_MCP_APPROVAL_TOKEN: "short" }),
    ).toThrow();
  });

  it("treats empty approval_token as no token", () => {
    const env = parseEnv({ ...baseEnv, PROXMOX_MCP_APPROVAL_TOKEN: "" });
    expect(env.PROXMOX_MCP_APPROVAL_TOKEN).toBe("");
  });

  it("accepts audit_only flag", () => {
    const env = parseEnv({ ...baseEnv, PROXMOX_MCP_AUDIT_ONLY: "true" });
    expect(env.PROXMOX_MCP_AUDIT_ONLY).toBe(true);
  });
});