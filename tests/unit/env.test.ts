import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

// Helper: clear process.env side effects from dotenv loading
const ISOLATED: NodeJS.ProcessEnv = {};

describe("parseEnv", () => {
  it("accepts a valid minimal env", () => {
    const env = parseEnv({
      PROXMOX_HOST: "pve.example.com",
      PROXMOX_USER: "root@pam",
      PROXMOX_TOKEN_NAME: "mcp",
      PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
    });
    expect(env.PROXMOX_HOST).toBe("pve.example.com");
    expect(env.PROXMOX_PORT).toBe(8006);
    expect(env.PROXMOX_VERIFY_SSL).toBe(true);
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejects invalid user format", () => {
    expect(() =>
      parseEnv({
        PROXMOX_HOST: "pve.example.com",
        PROXMOX_USER: "user@INVALID REALM",
        PROXMOX_TOKEN_NAME: "mcp",
        PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
      }),
    ).toThrow(/Invalid environment configuration/);
  });

  it("rejects verify_ssl=false without dev_mode=true", () => {
    expect(() =>
      parseEnv({
        PROXMOX_HOST: "pve.example.com",
        PROXMOX_USER: "root@pam",
        PROXMOX_TOKEN_NAME: "mcp",
        PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
        PROXMOX_VERIFY_SSL: "false",
      }),
    ).toThrow(/PROXMOX_VERIFY_SSL/);
  });

  it("allows verify_ssl=false when dev_mode=true", () => {
    const env = parseEnv({
      PROXMOX_HOST: "pve.example.com",
      PROXMOX_USER: "root@pam",
      PROXMOX_TOKEN_NAME: "mcp",
      PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
      PROXMOX_VERIFY_SSL: "false",
      PROXMOX_DEV_MODE: "true",
    });
    expect(env.PROXMOX_VERIFY_SSL).toBe(false);
    expect(env.PROXMOX_DEV_MODE).toBe(true);
  });

  it("coerces boolean env vars", () => {
    const env = parseEnv({
      PROXMOX_HOST: "pve.example.com",
      PROXMOX_USER: "root@pam",
      PROXMOX_TOKEN_NAME: "mcp",
      PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
      PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE: "true",
      LOG_PRETTY: "1",
    });
    expect(env.PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE).toBe(true);
    expect(env.LOG_PRETTY).toBe(true);
  });

  it("parses SSH host overrides as JSON", () => {
    const env = parseEnv({
      PROXMOX_HOST: "pve.example.com",
      PROXMOX_USER: "root@pam",
      PROXMOX_TOKEN_NAME: "mcp",
      PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
      PROXMOX_SSH_HOST_OVERRIDES: '{"pve1":"10.0.0.1","pve2":"10.0.0.2"}',
    });
    expect(env.PROXMOX_SSH_HOST_OVERRIDES).toEqual({ pve1: "10.0.0.1", pve2: "10.0.0.2" });
  });

  it("rejects invalid SSH host overrides JSON", () => {
    expect(() =>
      parseEnv({
        PROXMOX_HOST: "pve.example.com",
        PROXMOX_USER: "root@pam",
        PROXMOX_TOKEN_NAME: "mcp",
        PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
        PROXMOX_SSH_HOST_OVERRIDES: "not-json",
      }),
    ).toThrow(/SSH_HOST_OVERRIDES/);
  });
});