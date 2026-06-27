import { describe, expect, it } from "vitest";
import {
  PolicyGate,
  registerRisk,
} from "../../src/safety/policy.js";
import { buildAppConfig } from "../../src/config/types.js";
import { parseEnv } from "../../src/config/env.js";

function makeConfig(overrides: Partial<{
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
  cfg.safety.dangerouslyAllowDestructive = overrides.dangerouslyAllow ?? false;
  cfg.safety.auditOnly = overrides.auditOnly ?? false;
  return cfg;
}

describe("PolicyGate", () => {
  it("allows low-risk tools unconditionally", () => {
    registerRisk("test_low", "low");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertAllowed("test_low", {});
    expect(decision.allowed).toBe(true);
  });

  it("allows medium-risk tools (logs in audit mode)", () => {
    registerRisk("test_medium", "medium");
    const gate = new PolicyGate({ safety: makeConfig({ auditOnly: true }).safety });
    const decision = gate.assertAllowed("test_medium", { foo: "bar" });
    expect(decision.allowed).toBe(true);
  });

  it("returns a confirmation prompt for high-risk tools without confirm=true", () => {
    registerRisk("test_high", "high");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertAllowed("test_high", { node: "pve", vmid: "100" });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.prompt).toMatch(/Confirmation required/);
      expect(decision.prompt).toMatch(/node=pve/);
      expect(decision.prompt).toMatch(/vmid=100/);
      expect(decision.prompt).toMatch(/confirm: true/);
    }
  });

  it("allows high-risk tools with confirm=true", () => {
    registerRisk("test_high", "high");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertAllowed("test_high", { confirm: true });
    expect(decision.allowed).toBe(true);
  });

  it("rejects high-risk tools with confirm=false", () => {
    registerRisk("test_high", "high");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertAllowed("test_high", { confirm: false });
    expect(decision.allowed).toBe(false);
  });

  it("allows high-risk tools with dangerously_allow_destructive", () => {
    registerRisk("test_high", "high");
    const gate = new PolicyGate({ safety: makeConfig({ dangerouslyAllow: true }).safety });
    const decision = gate.assertAllowed("test_high", {});
    expect(decision.allowed).toBe(true);
  });

  it("returns a confirmation prompt for destructive tools without confirm=true", () => {
    registerRisk("test_destructive", "destructive");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertAllowed("test_destructive", { node: "pve", vmid: "100" });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.prompt).toMatch(/DESTRUCTIVE/);
    }
  });

  it("treats unknown tools as low risk", () => {
    const gate = new PolicyGate({ safety: makeConfig().safety });
    expect(gate.assertAllowed("not_in_registry", {}).allowed).toBe(true);
  });

  it("enforceAllowed throws ConfirmationRequiredError for unconfirmed high-risk calls", () => {
    registerRisk("test_high_throw", "high");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    expect(() => gate.enforceAllowed("test_high_throw", {})).toThrow(/Confirmation required/);
  });
});