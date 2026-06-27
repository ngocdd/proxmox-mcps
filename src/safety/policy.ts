/**
 * PolicyGate — safety gate for tool invocations.
 *
 * Classifies tools by risk (low/medium/high/destructive). High and destructive
 * tools require an explicit `confirm: true` argument from the caller (the
 * model must surface a yes/no question to the user and re-invoke once the
 * user agrees). `dangerously_allow_destructive` skips the prompt entirely —
 * use only in automation / trusted environments.
 *
 * Full tool registry lives in `risk.ts`.
 */
import { ConfirmationRequiredError } from "../proxmox/errors.js";
import type { SafetyConfig } from "../config/types.js";
import type { Logger } from "../log.js";

export type Risk = "low" | "medium" | "high" | "destructive";

export interface PolicyGateOptions {
  safety: SafetyConfig;
  logger?: Logger;
}

/** Mutable risk registry keyed by tool name. */
const RISK_REGISTRY = new Map<string, Risk>();

export function registerRisk(toolName: string, risk: Risk): void {
  RISK_REGISTRY.set(toolName, risk);
}

export function getRisk(toolName: string): Risk {
  return RISK_REGISTRY.get(toolName) ?? "low";
}

export function listRiskRegistry(): Record<string, Risk> {
  return Object.fromEntries(RISK_REGISTRY);
}

/** Decision returned by `assertAllowed`. */
export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; prompt: string };

export class PolicyGate {
  private readonly safety: SafetyConfig;
  private readonly logger: Logger | undefined;

  constructor(opts: PolicyGateOptions) {
    this.safety = opts.safety;
    this.logger = opts.logger;
  }

  /**
   * Decide whether a tool call should proceed. For high/destructive tools,
   * returns a confirmation prompt unless the caller passed `confirm: true`
   * (or the operator opted into `dangerously_allow_destructive`).
   */
  assertAllowed(toolName: string, args: Record<string, unknown>): PolicyDecision {
    const risk = getRisk(toolName);
    if (risk === "low") return { allowed: true };

    if (risk === "medium") {
      if (this.safety.auditOnly) {
        this.logger?.info({ tool: toolName, risk, args: scrubArgs(args) }, "policy.audit");
      }
      return { allowed: true };
    }

    // risk === "high" || risk === "destructive"
    if (this.safety.dangerouslyAllowDestructive) {
      this.logger?.warn(
        { tool: toolName, risk, args: scrubArgs(args), bypass: "dangerously_allow_destructive" },
        "policy.bypass",
      );
      return { allowed: true };
    }

    if (args.confirm === true) {
      this.logger?.warn({ tool: toolName, risk, args: scrubArgs(args) }, "policy.confirmed");
      return { allowed: true };
    }

    const prompt = buildConfirmationPrompt(toolName, risk, args);
    this.logger?.info({ tool: toolName, risk, args: scrubArgs(args) }, "policy.confirm_requested");
    return { allowed: false, prompt };
  }

  /**
   * Throwing variant — kept for callers that prefer raise-and-catch.
   */
  enforceAllowed(toolName: string, args: Record<string, unknown>): void {
    const decision = this.assertAllowed(toolName, args);
    if (!decision.allowed) {
      const risk = getRisk(toolName);
      // assertAllowed only returns !allowed for high/destructive tools.
      throw new ConfirmationRequiredError(toolName, risk as "high" | "destructive", decision.prompt);
    }
  }
}

function buildConfirmationPrompt(
  toolName: string,
  risk: "high" | "destructive",
  args: Record<string, unknown>,
): string {
  const summary = summariseArgs(args);
  const verdict = risk === "destructive" ? "is DESTRUCTIVE and cannot be undone" : "is HIGH-RISK";
  return [
    `⚠️  Confirmation required: '${toolName}' ${verdict}.`,
    summary ? `Target: ${summary}` : null,
    "Ask the user to reply 'yes' to proceed, or anything else to cancel.",
    "If they confirm, re-invoke this tool with `confirm: true` added to the arguments.",
  ]
    .filter(Boolean)
    .join("\n");
}

function summariseArgs(args: Record<string, unknown>): string {
  // Show only the identifying fields, in a stable order, so the user can verify.
  const preferred = ["node", "vmid", "name", "storage", "filename", "iface", "group", "sid", "poolid", "vnet", "subnet"];
  const parts: string[] = [];
  for (const k of preferred) {
    if (args[k] !== undefined && args[k] !== null) {
      parts.push(`${k}=${String(args[k])}`);
    }
  }
  // Fall back to all scalar args if nothing matched.
  if (parts.length === 0) {
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "object") continue;
      parts.push(`${k}=${String(v)}`);
    }
  }
  return parts.join(", ");
}

function scrubArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === "password" || k === "new_password" || k === "cipassword") {
      out[k] = "[REDACTED]";
    } else {
      out[k] = v;
    }
  }
  return out;
}