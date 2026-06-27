import { describe, expect, it } from "vitest";
import {
  PolicyGate,
  registerRisk,
} from "../../src/safety/policy.js";
import { ApprovalRequiredError } from "../../src/proxmox/errors.js";
import { buildAppConfig } from "../../src/config/types.js";
import { parseEnv } from "../../src/config/env.js";

function makeConfig(overrides: Partial<{
  approvalToken: string | null;
  dangerouslyAllow: boolean;
  auditOnly: boolean;
}> = {}) {
  const env = parseEnv({
    PROXMOX_HOST: "pve.example.com",
    PROXMOX_USER: "root@pam",
    PROXMOX_TOKEN_NAME: "mcp",
    PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
  });
  const cfg = buildAppConfig(env);
  cfg.safety.approvalToken = overrides.approvalToken ?? null;
  cfg.safety.dangerouslyAllowDestructive = overrides.dangerouslyAllow ?? false;
  cfg.safety.auditOnly = overrides.auditOnly ?? false;
  return cfg;
}

describe("PolicyGate", () => {
  it("allows low-risk tools unconditionally", () => {
    registerRisk("test_low", "low");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    expect(gate.assertAllowed("test_low", {})).toBe(true);
  });

  it("allows medium-risk tools (just logs in audit mode)", () => {
    registerRisk("test_medium", "medium");
    const gate = new PolicyGate({ safety: makeConfig({ auditOnly: true }).safety });
    expect(gate.assertAllowed("test_medium", { foo: "bar" })).toBe(true);
  });

  it("blocks high-risk tools without approval", () => {
    registerRisk("test_high", "high");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    expect(() => gate.assertAllowed("test_high", {})).toThrow(ApprovalRequiredError);
  });

  it("allows high-risk tools with dangerously_allow_destructive", () => {
    registerRisk("test_high", "high");
    const gate = new PolicyGate({ safety: makeConfig({ dangerouslyAllow: true }).safety });
    expect(gate.assertAllowed("test_high", {})).toBe(true);
  });

  it("allows high-risk tools with matching approval_token", () => {
    registerRisk("test_high", "high");
    const gate = new PolicyGate({
      safety: makeConfig({ approvalToken: "secret-token-1234" }).safety,
    });
    expect(gate.assertAllowed("test_high", { approval_token: "secret-token-1234" })).toBe(true);
  });

  it("rejects high-risk tools with wrong approval_token", () => {
    registerRisk("test_high", "high");
    const gate = new PolicyGate({
      safety: makeConfig({ approvalToken: "secret-token-1234" }).safety,
    });
    expect(() => gate.assertAllowed("test_high", { approval_token: "wrong-token" })).toThrow(
      ApprovalRequiredError,
    );
  });

  it("blocks destructive tools without approval", () => {
    registerRisk("test_destructive", "destructive");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    expect(() => gate.assertAllowed("test_destructive", {})).toThrow(ApprovalRequiredError);
  });

  it("treats unknown tools as low risk", () => {
    const gate = new PolicyGate({ safety: makeConfig().safety });
    expect(gate.assertAllowed("not_in_registry", {})).toBe(true);
  });
});