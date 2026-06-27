/**
 * Resource Pool tools: list, get, create, update, delete.
 *
 * Pools let you group VMs and CTs for access control (pools.Audit,
 * pools.Modify, pools.Operator) and bulk operations.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerPoolTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_pools",
    {
      title: "List resource pools",
      description: "List all resource pools cluster-wide with member counts.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "list_pools", {}, async () => {
        const data = await ctx.client.get(paths.pools());
        return jsonResult(`Pools (${Array.isArray(data) ? data.length : "?"}):`, data);
      }),
  );

  server.registerTool(
    "get_pool",
    {
      title: "Get resource pool",
      description: "Get a single resource pool with its members.",
      inputSchema: z
        .object({ poolid: z.string().min(1).describe("Pool ID") })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ poolid }) =>
      runTool(ctx, "get_pool", { poolid }, async () => {
        const data = await ctx.client.get(paths.pool(poolid));
        return jsonResult(`Pool ${poolid}:`, data);
      }),
  );

  server.registerTool(
    "create_pool",
    {
      title: "Create resource pool",
      description: "Create a new resource pool. Optionally assign VMs/CTs at creation time.",
      inputSchema: z
        .object({
          poolid: z.string().min(1).regex(/^[a-zA-Z0-9_\-]+$/).describe("Pool ID"),
          comment: z.string().max(1024).optional(),
          storage: z.array(z.string()).optional().describe("Restrict pool to these storages"),
          vms: z.array(z.union([z.string(), z.number()])).optional().describe("Initial VM/CT IDs"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(ctx, "create_pool", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = { poolid: args.poolid };
        if (args.comment) body.comment = args.comment;
        if (args.storage) body.storage = args.storage.join(",");
        if (args.vms) body.vms = args.vms.join(",");
        await ctx.client.post(paths.pools(), body);
        return jsonResult(`Pool ${args.poolid} created.`, { poolid: args.poolid });
      }),
  );

  server.registerTool(
    "update_pool",
    {
      title: "Update resource pool",
      description: "Update an existing resource pool (comment, allowed storages, VM/CT membership).",
      inputSchema: z
        .object({
          poolid: z.string().min(1),
          comment: z.string().max(1024).optional(),
          storage: z.array(z.string()).optional().describe("Allowed storages (replaces existing list)"),
          vms: z.array(z.union([z.string(), z.number()])).optional().describe("VM/CT IDs to assign"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(ctx, "update_pool", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        if (args.comment !== undefined) body.comment = args.comment;
        if (args.storage) body.storage = args.storage.join(",");
        if (args.vms) body.vms = args.vms.join(",");
        await ctx.client.put(paths.pool(args.poolid), body);
        return jsonResult(`Pool ${args.poolid} updated.`, { poolid: args.poolid });
      }),
  );

  server.registerTool(
    "delete_pool",
    {
      title: "Delete resource pool",
      description:
        "Permanently delete a resource pool. Members are NOT deleted; they remain orphaned. DESTRUCTIVE — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          poolid: z.string().min(1),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ poolid, confirm }) =>
      runTool(ctx, "delete_pool", { poolid, confirm }, async () => {
        await ctx.client.delete(paths.pool(poolid));
        return jsonResult(`Pool ${poolid} deleted.`, { poolid });
      }),
  );
}