import { describe, expect, it } from "vitest";
import {
  PolicyGate,
  SENSITIVE_CONFIG_KEYS,
  configHasSensitiveKey,
  listSensitiveConfigKeys,
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

describe("SENSITIVE_CONFIG_KEYS", () => {
  it("includes 'protection' (Proxmox delete-protection flag)", () => {
    expect(SENSITIVE_CONFIG_KEYS.has("protection")).toBe(true);
  });

  it("does not include ordinary config keys", () => {
    expect(SENSITIVE_CONFIG_KEYS.has("cores")).toBe(false);
    expect(SENSITIVE_CONFIG_KEYS.has("memory")).toBe(false);
    expect(SENSITIVE_CONFIG_KEYS.has("onboot")).toBe(false);
  });
});

describe("configHasSensitiveKey / listSensitiveConfigKeys", () => {
  it("returns true / lists the key when `protection` is in the config", () => {
    expect(configHasSensitiveKey({ protection: 1 })).toBe(true);
    expect(configHasSensitiveKey({ cores: 4, protection: 0 })).toBe(true);
    expect(listSensitiveConfigKeys({ protection: 0 })).toEqual(["protection"]);
    expect(listSensitiveConfigKeys({ cores: 4, protection: 1, memory: 2048 })).toEqual([
      "protection",
    ]);
  });

  it("returns false / empty when no sensitive key is present", () => {
    expect(configHasSensitiveKey({ cores: 4, memory: 2048 })).toBe(false);
    expect(listSensitiveConfigKeys({ cores: 4 })).toEqual([]);
    expect(listSensitiveConfigKeys({})).toEqual([]);
  });
});

describe("PolicyGate.assertProtectedKeyChange", () => {
  it("returns allowed when no sensitive key is in the config", () => {
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertProtectedKeyChange(
      "update_container_config",
      { node: "pve", vmid: "200" },
      { cores: 4, memory: 2048 },
    );
    expect(decision.allowed).toBe(true);
  });

  it("demands confirmation when `protection` is being modified (no confirm=true)", () => {
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertProtectedKeyChange(
      "update_vm_config",
      { node: "pve", vmid: "100", config: { protection: 0 } },
      { protection: 0 },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.prompt).toMatch(/Confirmation required/);
      expect(decision.prompt).toMatch(/DESTRUCTIVE/);
      expect(decision.prompt).toMatch(/protection/);
      expect(decision.prompt).toMatch(/node=pve/);
      expect(decision.prompt).toMatch(/vmid=100/);
      expect(decision.prompt).toMatch(/confirm: true/);
    }
  });

  it("allows when `protection` is being modified AND confirm=true", () => {
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertProtectedKeyChange(
      "update_container_config",
      { confirm: true },
      { protection: 1 },
    );
    expect(decision.allowed).toBe(true);
  });

  it("rejects when confirm=false even if protection is being modified", () => {
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertProtectedKeyChange(
      "update_vm_config",
      { confirm: false },
      { protection: 0 },
    );
    expect(decision.allowed).toBe(false);
  });

  it("bypasses the prompt when dangerously_allow_destructive is set", () => {
    const gate = new PolicyGate({ safety: makeConfig({ dangerouslyAllow: true }).safety });
    const decision = gate.assertProtectedKeyChange(
      "update_vm_config",
      {},
      { protection: 0 },
    );
    expect(decision.allowed).toBe(true);
  });

  it("still requires confirmation for tools already classified as medium (container case)", () => {
    // update_container_config is medium risk — but assertProtectedKeyChange
    // should still escalate when `protection` is being changed.
    registerRisk("update_container_config", "medium");
    const gate = new PolicyGate({ safety: makeConfig().safety });
    const decision = gate.assertProtectedKeyChange(
      "update_container_config",
      { node: "pve", vmid: "200" },
      { protection: 0 },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.prompt).toMatch(/DESTRUCTIVE/);
    }
  });
});