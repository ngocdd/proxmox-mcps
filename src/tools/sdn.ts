/**
 * Software-Defined Networking tools (controllers, zones, vnets, subnets).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerSdnTools(server: McpServer, ctx: ToolContext): void {
  // ---- Controllers -------------------------------------------------------

  server.registerTool(
    "list_sdn_controllers",
    {
      title: "List SDN controllers",
      description: "List SDN controllers (e.g. EVPN, ISIS, bgp).",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      runTool(ctx, "list_sdn_controllers", {}, async () => {
        const data = await ctx.client.get(paths.sdnControllers());
        return jsonResult(`SDN controllers:`, data);
      }),
  );

  server.registerTool(
    "get_sdn_controller",
    {
      title: "Get SDN controller",
      description: "Get a single SDN controller by name.",
      inputSchema: z.object({ name: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name }) =>
      runTool(ctx, "get_sdn_controller", { name }, async () => {
        const data = await ctx.client.get(paths.sdnController(name));
        return jsonResult(`SDN controller ${name}:`, data);
      }),
  );

  server.registerTool(
    "create_sdn_controller",
    {
      title: "Create SDN controller",
      description:
        "Create an SDN controller (EVPN/ISIS/bgp). HIGH RISK — network connectivity depends on this. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          name: z.string().min(1).regex(/^[a-zA-Z0-9_\-]+$/).describe("Controller name"),
          type: z.enum(["evpn", "isis", "bgp", "pimsm", "pimssm"]).default("evpn"),
          asn: z.number().int().min(0).optional().describe("ASN (for bgp)"),
          peers: z.string().optional().describe("Peer addresses"),
          ebgp: z.boolean().optional(),
          ebgp_multihop: z.number().int().optional(),
          loopback: z.string().optional(),
          node: z.string().optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "create_sdn_controller", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = { name: args.name, type: args.type };
        for (const [k, v] of Object.entries(args)) {
          if (k === "name" || k === "type" || v === undefined) continue;
          body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.post(paths.sdnControllers(), body);
        return jsonResult(`SDN controller ${args.name} created.`, { name: args.name });
      }),
  );

  server.registerTool(
    "update_sdn_controller",
    {
      title: "Update SDN controller",
      description:
        "Update an existing SDN controller. HIGH RISK — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          name: z.string().min(1),
          asn: z.number().int().optional(),
          peers: z.string().optional(),
          ebgp: z.boolean().optional(),
          delete: z.array(z.string()).optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "update_sdn_controller", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "name" || v === undefined) continue;
          if (k === "delete" && Array.isArray(v)) body.delete = v.join(",");
          else body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.put(paths.sdnController(args.name as string), body);
        return jsonResult(`SDN controller ${args.name} updated.`, { name: args.name });
      }),
  );

  server.registerTool(
    "delete_sdn_controller",
    {
      title: "Delete SDN controller",
      description:
        "Delete an SDN controller. DESTRUCTIVE — associated zones/vnets will stop working. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          name: z.string().min(1),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ name, confirm }) =>
      runTool(ctx, "delete_sdn_controller", { name, confirm }, async () => {
        await ctx.client.delete(paths.sdnController(name));
        return jsonResult(`SDN controller ${name} deleted.`, { name });
      }),
  );

  // ---- Zones -------------------------------------------------------------

  server.registerTool(
    "list_sdn_zones",
    {
      title: "List SDN zones",
      description: "List SDN zones (vxlan, evpn, simple, qinq, vlan).",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      runTool(ctx, "list_sdn_zones", {}, async () => {
        const data = await ctx.client.get(paths.sdnZones());
        return jsonResult(`SDN zones:`, data);
      }),
  );

  server.registerTool(
    "get_sdn_zone",
    {
      title: "Get SDN zone",
      description: "Get a single SDN zone.",
      inputSchema: z.object({ name: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name }) =>
      runTool(ctx, "get_sdn_zone", { name }, async () => {
        const data = await ctx.client.get(paths.sdnZone(name));
        return jsonResult(`SDN zone ${name}:`, data);
      }),
  );

  server.registerTool(
    "create_sdn_zone",
    {
      title: "Create SDN zone",
      description:
        "Create an SDN zone (vxlan/evpn/simple/qinq/vlan). HIGH RISK — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          name: z.string().min(1).regex(/^[a-zA-Z0-9_\-]+$/),
          type: z.enum(["evpn", "vxlan", "simple", "qinq", "vlan"]).default("vxlan"),
          controller: z.string().optional().describe("Controller name (for evpn)"),
          bridge: z.string().optional(),
          mtu: z.number().int().min(1280).max(65535).optional(),
          vlan_protocol: z.enum(["802.1ad", "802.1q"]).optional(),
          vxlan_port: z.number().int().min(1).max(65535).optional(),
          peers: z.string().optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "create_sdn_zone", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = { name: args.name, type: args.type };
        for (const [k, v] of Object.entries(args)) {
          if (k === "name" || k === "type" || v === undefined) continue;
          body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.post(paths.sdnZones(), body);
        return jsonResult(`SDN zone ${args.name} created.`, { name: args.name });
      }),
  );

  server.registerTool(
    "update_sdn_zone",
    {
      title: "Update SDN zone",
      description: "Update an SDN zone. HIGH RISK — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          name: z.string().min(1),
          controller: z.string().optional(),
          bridge: z.string().optional(),
          mtu: z.number().int().optional(),
          vxlan_port: z.number().int().optional(),
          delete: z.array(z.string()).optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "update_sdn_zone", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "name" || v === undefined) continue;
          if (k === "delete" && Array.isArray(v)) body.delete = v.join(",");
          else body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.put(paths.sdnZone(args.name as string), body);
        return jsonResult(`SDN zone ${args.name} updated.`, { name: args.name });
      }),
  );

  server.registerTool(
    "delete_sdn_zone",
    {
      title: "Delete SDN zone",
      description:
        "Delete an SDN zone. DESTRUCTIVE — vnets/subnets in this zone will stop working. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          name: z.string().min(1),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ name, confirm }) =>
      runTool(ctx, "delete_sdn_zone", { name, confirm }, async () => {
        await ctx.client.delete(paths.sdnZone(name));
        return jsonResult(`SDN zone ${name} deleted.`, { name });
      }),
  );

  // ---- Vnets -------------------------------------------------------------

  server.registerTool(
    "list_sdn_vnets",
    {
      title: "List SDN vnets",
      description: "List SDN virtual networks.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      runTool(ctx, "list_sdn_vnets", {}, async () => {
        const data = await ctx.client.get(paths.sdnVnets());
        return jsonResult(`SDN vnets:`, data);
      }),
  );

  server.registerTool(
    "get_sdn_vnet",
    {
      title: "Get SDN vnet",
      description: "Get a single SDN virtual network.",
      inputSchema: z.object({ name: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name }) =>
      runTool(ctx, "get_sdn_vnet", { name }, async () => {
        const data = await ctx.client.get(paths.sdnVnet(name));
        return jsonResult(`SDN vnet ${name}:`, data);
      }),
  );

  server.registerTool(
    "create_sdn_vnet",
    {
      title: "Create SDN vnet",
      description: "Create an SDN virtual network (zone-scoped).",
      inputSchema: z
        .object({
          name: z.string().min(1).regex(/^[a-zA-Z0-9_\-]+$/),
          zone: z.string().min(1).describe("Parent zone name"),
          tag: z.number().int().min(1).max(4094).optional(),
          vlanaware: z.boolean().optional(),
          alias: z.string().optional(),
          comment: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "create_sdn_vnet", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = { name: args.name, zone: args.zone };
        if (args.tag !== undefined) body.tag = args.tag;
        if (args.vlanaware !== undefined) body.vlanaware = args.vlanaware ? 1 : 0;
        if (args.alias) body.alias = args.alias;
        if (args.comment) body.comment = args.comment;
        await ctx.client.post(paths.sdnVnets(), body);
        return jsonResult(`SDN vnet ${args.name} created.`, { name: args.name });
      }),
  );

  server.registerTool(
    "update_sdn_vnet",
    {
      title: "Update SDN vnet",
      description: "Update an SDN vnet (tag, comment, alias).",
      inputSchema: z
        .object({
          name: z.string().min(1),
          tag: z.number().int().optional(),
          vlanaware: z.boolean().optional(),
          alias: z.string().optional(),
          comment: z.string().optional(),
          delete: z.array(z.string()).optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "update_sdn_vnet", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "name" || v === undefined) continue;
          if (k === "delete" && Array.isArray(v)) body.delete = v.join(",");
          else body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.put(paths.sdnVnet(args.name as string), body);
        return jsonResult(`SDN vnet ${args.name} updated.`, { name: args.name });
      }),
  );

  server.registerTool(
    "delete_sdn_vnet",
    {
      title: "Delete SDN vnet",
      description:
        "Delete an SDN vnet and its subnets. DESTRUCTIVE — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          name: z.string().min(1),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ name, confirm }) =>
      runTool(ctx, "delete_sdn_vnet", { name, confirm }, async () => {
        await ctx.client.delete(paths.sdnVnet(name));
        return jsonResult(`SDN vnet ${name} deleted.`, { name });
      }),
  );

  // ---- Subnets -----------------------------------------------------------

  server.registerTool(
    "list_sdn_subnets",
    {
      title: "List SDN subnets",
      description: "List all subnets within an SDN vnet.",
      inputSchema: z.object({ vnet: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ vnet }) =>
      runTool(ctx, "list_sdn_subnets", { vnet }, async () => {
        const data = await ctx.client.get(paths.sdnSubnets(vnet));
        return jsonResult(`Subnets in ${vnet}:`, data);
      }),
  );

  server.registerTool(
    "get_sdn_subnet",
    {
      title: "Get SDN subnet",
      description: "Get a single SDN subnet.",
      inputSchema: z.object({ vnet: z.string().min(1), subnet: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ vnet, subnet }) =>
      runTool(ctx, "get_sdn_subnet", { vnet, subnet }, async () => {
        const data = await ctx.client.get(paths.sdnSubnet(vnet, subnet));
        return jsonResult(`Subnet ${subnet} in ${vnet}:`, data);
      }),
  );

  server.registerTool(
    "create_sdn_subnet",
    {
      title: "Create SDN subnet",
      description: "Create an IP subnet inside an SDN vnet.",
      inputSchema: z
        .object({
          vnet: z.string().min(1),
          subnet: z.string().min(1).describe("CIDR, e.g. 10.10.0.0/24"),
          gateway: z.string().optional(),
          snat: z.boolean().optional(),
          dhcp: z.enum(["none", "dnsmasq"]).optional(),
          dns: z.string().optional(),
          comments: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "create_sdn_subnet", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = { subnet: args.subnet };
        if (args.gateway) body.gateway = args.gateway;
        if (args.snat !== undefined) body.snat = args.snat ? 1 : 0;
        if (args.dhcp) body.dhcp = args.dhcp;
        if (args.dns) body.dns = args.dns;
        if (args.comments) body.comments = args.comments;
        await ctx.client.post(paths.sdnSubnets(args.vnet as string), body);
        return jsonResult(`Subnet ${args.subnet} added to ${args.vnet}.`, { subnet: args.subnet });
      }),
  );

  server.registerTool(
    "update_sdn_subnet",
    {
      title: "Update SDN subnet",
      description: "Update an SDN subnet.",
      inputSchema: z
        .object({
          vnet: z.string().min(1),
          subnet: z.string().min(1),
          gateway: z.string().optional(),
          snat: z.boolean().optional(),
          dhcp: z.enum(["none", "dnsmasq"]).optional(),
          dns: z.string().optional(),
          comments: z.string().optional(),
          delete: z.array(z.string()).optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "update_sdn_subnet", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "vnet" || k === "subnet" || v === undefined) continue;
          if (k === "delete" && Array.isArray(v)) body.delete = v.join(",");
          else body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.put(paths.sdnSubnet(args.vnet as string, args.subnet as string), body);
        return jsonResult(`Subnet ${args.subnet} in ${args.vnet} updated.`, { subnet: args.subnet });
      }),
  );

  server.registerTool(
    "delete_sdn_subnet",
    {
      title: "Delete SDN subnet",
      description:
        "Delete an SDN subnet. DESTRUCTIVE — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          vnet: z.string().min(1),
          subnet: z.string().min(1),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ vnet, subnet, confirm }) =>
      runTool(ctx, "delete_sdn_subnet", { vnet, subnet, confirm }, async () => {
        await ctx.client.delete(paths.sdnSubnet(vnet, subnet));
        return jsonResult(`Subnet ${subnet} deleted from ${vnet}.`, { subnet });
      }),
  );

  // ---- Apply -------------------------------------------------------------

  server.registerTool(
    "apply_sdn",
    {
      title: "Apply SDN changes",
      description:
        "Push pending SDN changes to the cluster (rebuilds config and reloads daemons). HIGH RISK — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ confirm }) =>
      runTool(ctx, "apply_sdn", { confirm }, async () => {
        await ctx.client.put("/cluster/sdn", { pending: 0 });
        return jsonResult(`SDN apply triggered.`, { status: "ok" });
      }),
  );
}