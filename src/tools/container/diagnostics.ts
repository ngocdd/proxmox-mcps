/**
 * Container Diagnostics: RRD, firewall, exec (SSH + pct).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";

const TimeframeSchema = z.enum(["hour", "day", "week", "month", "year"]);

export function registerContainerDiagnosticsTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_container_rrd",
    {
      title: "Get container RRD time series",
      description: "Return RRD time series for an LXC container.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          timeframe: TimeframeSchema,
          cf: z.enum(["AVERAGE", "MAX", "MIN"]).default("AVERAGE"),
          ds: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid, timeframe, cf, ds }) =>
      runTool(ctx, "get_container_rrd", { node, vmid, timeframe, cf, ds }, async () => {
        const params: Record<string, unknown> = { cf };
        if (ds) params.ds = ds;
        const data = await ctx.client.get(paths.lxcRrd(node, vmid, timeframe), params);
        return jsonResult(`RRD for container ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "get_container_rrddata",
    {
      title: "Get container recent RRD samples",
      description: "Return recent RRD samples for an LXC container.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          timeframe: TimeframeSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid, timeframe }) =>
      runTool(ctx, "get_container_rrddata", { node, vmid, timeframe }, async () => {
        const data = await ctx.client.get(paths.lxcRrdData(node, vmid, timeframe));
        return jsonResult(`Recent RRD for container ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "container_firewall_rules",
    {
      title: "Get container firewall rules",
      description: "Return firewall rules for an LXC container.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid }) =>
      runTool(ctx, "container_firewall_rules", { node, vmid }, async () => {
        const data = await ctx.client.get(paths.lxcFirewallRules(node, vmid));
        return jsonResult(`Firewall rules for container ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "container_firewall_options",
    {
      title: "Get container firewall options",
      description: "Return container firewall options.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid }) =>
      runTool(ctx, "container_firewall_options", { node, vmid }, async () => {
        const data = await ctx.client.get(paths.lxcFirewallOptions(node, vmid));
        return jsonResult(`Firewall options for container ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "execute_container_command",
    {
      title: "Execute command in container (SSH + pct exec)",
      description:
        "Run a shell command inside an LXC container by shelling out to `pct exec <vmid> -- <cmd>` on the host. Requires SSH access (PROXMOX_SSH_* env).",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Host node that owns the container"),
          vmid: z.string().regex(/^\d+$/).describe("Container ID"),
          command: z.string().min(1).describe("Shell command to run inside the container"),
          timeout_seconds: z.number().int().min(1).max(600).optional().describe("Client timeout"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, command, timeout_seconds }) =>
      runTool(ctx, "execute_container_command", { node, vmid, command }, async () => {
        const result = await ctx.ssh.pctExec(node, vmid, command);
        const out =
          `Exit code: ${result.exitCode}\n` +
          `Duration: ${result.durationMs}ms\n` +
          (result.stdout ? `\n--- stdout ---\n${result.stdout}` : "") +
          (result.stderr ? `\n--- stderr ---\n${result.stderr}` : "");
        return jsonResult(out, { exitCode: result.exitCode, durationMs: result.durationMs, timeout: timeout_seconds });
      }),
  );
}