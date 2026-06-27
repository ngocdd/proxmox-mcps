/**
 * Node-level tools: get_nodes, get_node_status, get_node_syslog, get_node_journal.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerNodeTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_nodes",
    {
      title: "List Proxmox nodes",
      description:
        "List all nodes in the cluster with their status, CPU, memory, uptime, and role.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "get_nodes", {}, async () => {
        const nodes = await ctx.client.get(paths.nodes());
        const enriched = await Promise.all(
          (nodes as Array<{ node: string }>).map(async (n) => {
            try {
              const status = await ctx.client.get(paths.nodeStatus(n.node));
              return { ...n, status };
            } catch {
              return n;
            }
          }),
        );
        return jsonResult("Nodes:", enriched);
      }),
  );

  server.registerTool(
    "get_node_status",
    {
      title: "Get single node status",
      description: "Get detailed status (CPU, memory, uptime, storage) for a single Proxmox node.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Node name (e.g. 'pve', 'pve2')"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node }) =>
      runTool(ctx, "get_node_status", { node }, async () => {
        const data = await ctx.client.get(paths.nodeStatus(node));
        return jsonResult(`Node ${node} status:`, data);
      }),
  );

  server.registerTool(
    "get_node_syslog",
    {
      title: "Get node syslog",
      description: "Read recent syslog lines from a Proxmox node.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Node name"),
          limit: z.number().int().min(1).max(5000).optional().describe("Number of lines to return (default 50)"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, limit }) =>
      runTool(ctx, "get_node_syslog", { node, limit }, async () => {
        const data = await ctx.client.get(paths.nodeSyslog(node, limit ?? 50));
        return jsonResult(`Syslog from ${node}:`, data);
      }),
  );

  server.registerTool(
    "get_node_journal",
    {
      title: "Get node systemd journal",
      description: "Read recent systemd journal entries from a Proxmox node.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Node name"),
          limit: z.number().int().min(1).max(5000).optional().describe("Number of lines to return (default 50)"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, limit }) =>
      runTool(ctx, "get_node_journal", { node, limit }, async () => {
        const data = await ctx.client.get(paths.nodeJournal(node, limit ?? 50));
        return jsonResult(`Journal from ${node}:`, data);
      }),
  );
}