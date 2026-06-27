/**
 * PolicyGate — safety gate for tool invocations.
 *
 * Classifies tools by risk (low/medium/high/destructive) and enforces
 * approval-token + dangerously_allow_destructive policy.
 *
 * Full tool registry lives in `risk.ts`. Phase 1A provides only the gate
 * skeleton; tool registrations add entries to the registry in 1B–1D.
 */
import { timingSafeEqual } from "node:crypto";
import { ApprovalRequiredError } from "../proxmox/errors.js";
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

export class PolicyGate {
  private readonly safety: SafetyConfig;
  private readonly logger: Logger | undefined;

  constructor(opts: PolicyGateOptions) {
    this.safety = opts.safety;
    this.logger = opts.logger;
  }

  /**
   * Decide whether a tool call should proceed. Throws ApprovalRequiredError
   * if the tool is high/destructive risk and neither token nor flag is set.
   *
   * @returns true if the call should proceed
   */
  assertAllowed(toolName: string, args: Record<string, unknown>): boolean {
    const risk = getRisk(toolName);
    if (risk === "low") return true;

    if (risk === "medium") {
      if (this.safety.auditOnly) {
        this.logger?.info({ tool: toolName, risk, args: scrubArgs(args) }, "policy.audit");
      }
      return true;
    }

    // risk === "high" || risk === "destructive"
    if (this.safety.dangerouslyAllowDestructive) {
      this.logger?.warn(
        { tool: toolName, risk, args: scrubArgs(args), bypass: "dangerously_allow_destructive" },
        "policy.bypass",
      );
      return true;
    }

    const providedToken = typeof args.approval_token === "string" ? args.approval_token : null;
    if (providedToken && this.safety.approvalToken && tokensMatch(providedToken, this.safety.approvalToken)) {
      this.logger?.warn({ tool: toolName, risk, args: scrubArgs(args) }, "policy.approved");
      return true;
    }

    throw new ApprovalRequiredError(toolName, risk);
  }
}

function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function scrubArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === "approval_token" || k === "password" || k === "new_password" || k === "cipassword") {
      out[k] = "[REDACTED]";
    } else {
      out[k] = v;
    }
  }
  return out;
}