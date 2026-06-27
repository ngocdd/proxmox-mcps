#!/usr/bin/env node
/**
 * `proxmox-mcps print-tools` (binary `proxmox-mcp-print-tools`) —
 * list every tool that would be registered.
 *
 * Pass `destructive` as the first arg to list only tools that require
 * approval (risk=destructive).
 *
 * Usage:
 *   node dist/cli/print-tools.js               # all tools
 *   node dist/cli/print-tools.js destructive   # only approval-gated tools
 */
import { listRiskRegistry } from "../safety/policy.js";
// Side-effect import: triggers risk registration (Phase 1B+).
import "../safety/risk.js";
// Side-effect import: also pulls in tool files so any future per-file
// registration logic runs.
import "../tools/index.js";

const filter = (process.argv[2] ?? "").trim().toLowerCase();

const reg = listRiskRegistry();
let tools = Object.entries(reg);

if (filter === "destructive") {
  tools = tools.filter(([, risk]) => risk === "destructive");
  if (tools.length === 0) {
    process.stdout.write("[INFO] No destructive tools registered.\n");
    process.exit(0);
  }
  process.stdout.write(`[OK] ${tools.length} destructive (approval-required) tool(s):\n\n`);
} else if (filter === "high" || filter === "medium" || filter === "low") {
  tools = tools.filter(([, risk]) => risk === filter);
  process.stdout.write(`[OK] ${tools.length} ${filter}-risk tool(s):\n\n`);
} else if (tools.length === 0) {
  process.stdout.write("[INFO] No tools registered yet. (Phase 1A skeleton)\n");
  process.exit(0);
} else {
  process.stdout.write(`[OK] ${tools.length} tool(s) registered:\n\n`);
}

tools.sort(([a], [b]) => a.localeCompare(b));

const maxLen = Math.max(...tools.map(([n]) => n.length));
for (const [name, risk] of tools) {
  process.stdout.write(`  ${name.padEnd(maxLen)}  risk=${risk}\n`);
}