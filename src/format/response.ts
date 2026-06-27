/**
 * MCP text-content helpers + runTool envelope.
 *
 * Centralizes how every tool converts its result into the MCP `content` shape.
 * Models read these as plain text; we prefer pretty-printed JSON with a
 * short header so they're scannable in Claude Code's UI.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { ApprovalRequiredError, ProxmoxApiError } from "../proxmox/errors.js";
import type { ToolContext } from "../tools/context.js";

/**
 * Convert anything to a JSON string with stable formatting.
 */
export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Build a successful text-content result. Tools use this for normal output.
 */
export function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/**
 * Build an error text-content result. Sets isError so the model knows.
 */
export function errResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * Convenience: JSON result with a header line.
 */
export function jsonResult(header: string, data: unknown): CallToolResult {
  return ok(`${header}\n\`\`\`json\n${toJson(data)}\n\`\`\``);
}

/**
 * Render an array of objects as a compact text table.
 * Falls back to JSON if records have varying keys.
 */
export function tableResult(header: string, rows: Record<string, unknown>[]): CallToolResult {
  if (rows.length === 0) {
    return ok(`${header}\n(empty)`);
  }
  // Collect all keys
  const keys = Array.from(
    rows.reduce((set, r) => {
      for (const k of Object.keys(r)) set.add(k);
      return set;
    }, new Set<string>()),
  );
  // Pick a sensible subset if too many
  const displayKeys = keys.length > 8 ? keys.slice(0, 8) : keys;

  const widths = displayKeys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
  );

  const fmt = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i] ?? c.length)).join("  ");

  const lines = [
    header,
    fmt(displayKeys),
    fmt(widths.map((w) => "-".repeat(w))),
    ...rows.map((r) => fmt(displayKeys.map((k) => String(r[k] ?? "")))),
  ];
  return ok(lines.join("\n"));
}

/**
 * Map any thrown error into a stable error result.
 */
export function errorResult(error: unknown): CallToolResult {
  if (error instanceof ApprovalRequiredError) {
    return errResult(
      `❌ ${error.message}\n\n` +
        `Provide an 'approval_token' argument equal to PROXMOX_MCP_APPROVAL_TOKEN, ` +
        `or set PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE=true in the MCP server environment.`,
    );
  }
  if (error instanceof ZodError) {
    return errResult(
      `❌ Invalid input:\n${error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}`,
    );
  }
  if (error instanceof ProxmoxApiError) {
    const detail = Object.keys(error.errors).length > 0
      ? ` (${Object.entries(error.errors).map(([k, v]) => `${k}=${v}`).join(", ")})`
      : "";
    return errResult(`❌ Proxmox API error (${error.status})${detail}: ${error.message}`);
  }
  if (error instanceof Error) {
    return errResult(`❌ ${error.message}`);
  }
  return errResult(`❌ ${String(error)}`);
}

/**
 * Standard envelope for every tool handler. Catches errors and maps to MCP
 * shape; tracks latency for logging; observes via policy gate.
 */
export async function runTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const start = Date.now();
  const toolLogger = ctx.logger.child({ tool: name });
  try {
    // Enforce policy (may throw ApprovalRequiredError)
    ctx.policy.assertAllowed(name, args);

    const result = await fn();
    const elapsedMs = Date.now() - start;
    toolLogger.info({ args: scrubArgs(args), elapsedMs, ok: true }, "tool.ok");
    return result;
  } catch (error) {
    const elapsedMs = Date.now() - start;
    toolLogger.warn(
      { args: scrubArgs(args), elapsedMs, err: error instanceof Error ? error.message : String(error) },
      "tool.err",
    );
    return errorResult(error);
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