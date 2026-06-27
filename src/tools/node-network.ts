/**
 * Node network interface management (bonds, bridges, VLANs).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerNodeNetworkTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_node_network",
    {
      title: "List node network interfaces",
      description: "Return all network interfaces (bonds, bridges, VLANs, physical) on a node.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "list_node_network", { node }, async () => {
        const data = await ctx.client.get(paths.nodeNetwork(node));
        return jsonResult(`Network interfaces on ${node}:`, data);
      }),
  );

  server.registerTool(
    "create_node_network",
    {
      title: "Create network interface",
      description:
        "Create a network interface (bond, bridge, VLAN, or physical). HIGH RISK — wrong config can disconnect the node. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          iface: z.string().min(1).describe("Interface name (e.g. 'vmbr1', 'bond0')"),
          type: z.enum(["bond", "bridge", "vlan", "eth", "alias", "OVSBridge", "OVSBond", "OVSPort", "OVSIntPort"]).default("bridge"),
          address: z.string().optional(),
          netmask: z.string().optional(),
          gateway: z.string().optional(),
          bridge_ports: z.string().optional(),
          bond_mode: z.enum(["balance-rr", "active-backup", "balance-xor", "broadcast", "802.3ad", "balance-tlb", "balance-alb"]).optional(),
          slaves: z.string().optional(),
          autostart: z.boolean().default(true),
          comments: z.string().optional(),
          vlan_id: z.number().int().min(1).max(4094).optional(),
          vlan_raw_device: z.string().optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "create_node_network", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = { iface: args.iface, type: args.type };
        for (const [k, v] of Object.entries(args)) {
          if (k === "node" || k === "iface" || k === "type" || v === undefined) continue;
          body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.post(paths.nodeNetwork(args.node as string), body);
        return jsonResult(`Interface ${args.iface} created on ${args.node}.`, { iface: args.iface });
      }),
  );

  server.registerTool(
    "update_node_network",
    {
      title: "Update network interface",
      description:
        "Update an existing network interface. HIGH RISK — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          iface: z.string().min(1),
          address: z.string().optional(),
          netmask: z.string().optional(),
          gateway: z.string().optional(),
          bridge_ports: z.string().optional(),
          comments: z.string().optional(),
          autostart: z.boolean().optional(),
          delete: z.array(z.string()).optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "update_node_network", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "node" || k === "iface" || v === undefined) continue;
          if (k === "delete" && Array.isArray(v)) body.delete = v.join(",");
          else body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.put(paths.nodeIface(args.node as string, args.iface as string), body);
        return jsonResult(`Interface ${args.iface} updated on ${args.node}.`, { iface: args.iface });
      }),
  );

  server.registerTool(
    "delete_node_network",
    {
      title: "Delete network interface",
      description:
        "Delete a network interface. HIGH RISK — will disconnect any VM/CT using it. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          iface: z.string().min(1),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, iface, confirm }) =>
      runTool(ctx, "delete_node_network", { node, iface, confirm }, async () => {
        await ctx.client.delete(paths.nodeIface(node, iface));
        return jsonResult(`Interface ${iface} deleted on ${node}.`, { iface });
      }),
  );

  server.registerTool(
    "reload_node_network",
    {
      title: "Reload node network",
      description: "Apply pending network changes (reloads /etc/network/interfaces). WARNING: may disconnect SSH!",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ node }) =>
      runTool(ctx, "reload_node_network", { node }, async () => {
        await ctx.client.put(paths.nodeNetwork(node), { reload: 1 });
        return jsonResult(`Network reloaded on ${node}.`, { node });
      }),
  );
}