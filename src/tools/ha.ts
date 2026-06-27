/**
 * High-Availability tools (cluster HA): resources, groups, manager status.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerHaTools(server: McpServer, ctx: ToolContext): void {
  // ---- HA Resources (managed VMs/CTs) ------------------------------------

  server.registerTool(
    "list_ha_resources",
    {
      title: "List HA-managed resources",
      description: "List all VMs and containers currently managed by the HA manager.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "list_ha_resources", {}, async () => {
        const data = await ctx.client.get(paths.haResources());
        return jsonResult(`HA resources (${Array.isArray(data) ? data.length : "?"}):`, data);
      }),
  );

  server.registerTool(
    "get_ha_resource_status",
    {
      title: "Get HA resource status",
      description: "Get the current HA manager state for a single resource.",
      inputSchema: z
        .object({ sid: z.string().min(1).describe("Service ID, e.g. 'vm:100' or 'ct:101'") })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sid }) =>
      runTool(ctx, "get_ha_resource_status", { sid }, async () => {
        const data = await ctx.client.get(paths.haResourceStatus(sid));
        return jsonResult(`HA status for ${sid}:`, data);
      }),
  );

  server.registerTool(
    "add_ha_resource",
    {
      title: "Add HA resource",
      description:
        "Make a VM or container HA-managed by the cluster. HIGH RISK — service will be restarted on failure.",
      inputSchema: z
        .object({
          sid: z.string().min(1).describe("Service ID, e.g. 'vm:100' or 'ct:101'"),
          group: z.string().optional().describe("HA group to assign (default: 'default')"),
          max_restart: z.number().int().min(0).max(10).optional().describe("Max restart attempts"),
          max_relocate: z.number().int().min(0).max(10).optional().describe("Max relocate attempts"),
          state: z.enum(["started", "stopped", "enabled", "disabled", "ignored"]).default("started"),
          comment: z.string().max(1024).optional(),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(ctx, "add_ha_resource", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = { sid: args.sid, state: args.state };
        if (args.group) body.group = args.group;
        if (args.max_restart !== undefined) body.max_restart = args.max_restart;
        if (args.max_relocate !== undefined) body.max_relocate = args.max_relocate;
        if (args.comment) body.comment = args.comment;
        await ctx.client.post(paths.haResources(), body);
        return jsonResult(`HA resource ${args.sid} added.`, { sid: args.sid });
      }),
  );

  server.registerTool(
    "remove_ha_resource",
    {
      title: "Remove HA resource",
      description: "Stop HA management of a VM or container.",
      inputSchema: z
        .object({
          sid: z.string().min(1),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ sid, approval_token }) =>
      runTool(ctx, "remove_ha_resource", { sid, approval_token }, async () => {
        await ctx.client.delete(paths.haResource(sid));
        return jsonResult(`HA resource ${sid} removed.`, { sid });
      }),
  );

  server.registerTool(
    "migrate_ha_resource",
    {
      title: "Migrate HA resource",
      description: "Trigger a live HA-managed migration of a resource to another node.",
      inputSchema: z
        .object({
          sid: z.string().min(1),
          target: z.string().min(1).describe("Target node"),
          force: z.boolean().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ sid, target, force }) =>
      runTool(ctx, "migrate_ha_resource", { sid, target, force }, async () => {
        const body: Record<string, unknown> = { target };
        if (force !== undefined) body.force = force ? 1 : 0;
        await ctx.client.post(paths.haResource(sid), body);
        return jsonResult(`HA migration of ${sid} → ${target} started.`, { sid, target });
      }),
  );

  // ---- HA Groups ---------------------------------------------------------

  server.registerTool(
    "list_ha_groups",
    {
      title: "List HA groups",
      description: "List HA groups with their node membership and failover policy.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "list_ha_groups", {}, async () => {
        const data = await ctx.client.get(paths.haGroups());
        return jsonResult(`HA groups:`, data);
      }),
  );

  server.registerTool(
    "get_ha_group",
    {
      title: "Get HA group",
      description: "Get a single HA group configuration.",
      inputSchema: z
        .object({ group: z.string().min(1) })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ group }) =>
      runTool(ctx, "get_ha_group", { group }, async () => {
        const data = await ctx.client.get(paths.haGroup(group));
        return jsonResult(`HA group ${group}:`, data);
      }),
  );

  server.registerTool(
    "create_ha_group",
    {
      title: "Create HA group",
      description:
        "Create an HA group with a list of preferred nodes and a failover/restart policy.",
      inputSchema: z
        .object({
          group: z.string().min(1).regex(/^[a-zA-Z0-9_\-]+$/).describe("Group name"),
          nodes: z.string().min(1).describe("Comma-separated node list (e.g. 'pve1,pve2,pve3')"),
          nofailback: z.boolean().optional(),
          restricted: z.boolean().optional(),
          comment: z.string().max(1024).optional(),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(
        ctx,
        "create_ha_group",
        args as Record<string, unknown>,
        async () => {
          const body: Record<string, unknown> = { group: args.group, nodes: args.nodes };
          if (args.nofailback !== undefined) body.nofailback = args.nofailback ? 1 : 0;
          if (args.restricted !== undefined) body.restricted = args.restricted ? 1 : 0;
          if (args.comment) body.comment = args.comment;
          await ctx.client.post(paths.haGroups(), body);
          return jsonResult(`HA group ${args.group} created.`, { group: args.group });
        },
      ),
  );

  server.registerTool(
    "update_ha_group",
    {
      title: "Update HA group",
      description: "Update an HA group (nodes, failback, restricted, comment).",
      inputSchema: z
        .object({
          group: z.string().min(1),
          nodes: z.string().optional(),
          nofailback: z.boolean().optional(),
          restricted: z.boolean().optional(),
          comment: z.string().max(1024).optional(),
          delete: z.array(z.string()).optional().describe("Properties to delete (e.g. ['comment'])"),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(ctx, "update_ha_group", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        if (args.nodes) body.nodes = args.nodes;
        if (args.nofailback !== undefined) body.nofailback = args.nofailback ? 1 : 0;
        if (args.restricted !== undefined) body.restricted = args.restricted ? 1 : 0;
        if (args.comment !== undefined) body.comment = args.comment;
        if (args.delete) body.delete = args.delete.join(",");
        await ctx.client.put(paths.haGroup(args.group), body);
        return jsonResult(`HA group ${args.group} updated.`, { group: args.group });
      }),
  );

  server.registerTool(
    "delete_ha_group",
    {
      title: "Delete HA group",
      description:
        "Delete an HA group. Resources assigned to it revert to the default group.",
      inputSchema: z
        .object({
          group: z.string().min(1),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ group, approval_token }) =>
      runTool(ctx, "delete_ha_group", { group, approval_token }, async () => {
        await ctx.client.delete(paths.haGroup(group));
        return jsonResult(`HA group ${group} deleted.`, { group });
      }),
  );

  server.registerTool(
    "get_ha_status",
    {
      title: "Get HA manager status",
      description:
        "Get the cluster HA manager status, including quorum and currently-active manager node.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "get_ha_status", {}, async () => {
        const data = await ctx.client.get(paths.haStatus());
        return jsonResult(`HA status:`, data);
      }),
  );
}