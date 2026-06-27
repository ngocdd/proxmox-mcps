/**
 * Cluster Replication tools (ZFS replication jobs).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerReplicationTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_replication_jobs",
    {
      title: "List replication jobs",
      description: "List all ZFS replication jobs cluster-wide.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      runTool(ctx, "list_replication_jobs", {}, async () => {
        const data = await ctx.client.get(paths.replication());
        return jsonResult(`Replication jobs:`, data);
      }),
  );

  server.registerTool(
    "list_node_replication",
    {
      title: "List replication jobs for a node",
      description: "List replication jobs where a specific node is the source.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "list_node_replication", { node }, async () => {
        const data = await ctx.client.get(paths.nodeReplication(node));
        return jsonResult(`Replication jobs on ${node}:`, data);
      }),
  );

  server.registerTool(
    "get_replication_job",
    {
      title: "Get replication job",
      description: "Get a single replication job by its ID.",
      inputSchema: z.object({ id: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) =>
      runTool(ctx, "get_replication_job", { id }, async () => {
        const data = await ctx.client.get(paths.replicationJob(id));
        return jsonResult(`Replication ${id}:`, data);
      }),
  );

  server.registerTool(
    "get_replication_status",
    {
      title: "Get replication job status",
      description: "Get the current replication status (last sync time, duration, errors).",
      inputSchema: z.object({ id: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) =>
      runTool(ctx, "get_replication_status", { id }, async () => {
        const data = await ctx.client.get(paths.replicationStatus(id));
        return jsonResult(`Replication ${id} status:`, data);
      }),
  );

  server.registerTool(
    "create_replication_job",
    {
      title: "Create replication job",
      description:
        "Create a ZFS replication job for a VM or container. Target must have a matching storage.",
      inputSchema: z
        .object({
          id: z.string().min(1).describe("Replication job ID"),
          target: z.string().min(1).describe("Target node"),
          schedule: z.string().min(1).describe("Replication schedule (e.g. '*/15')"),
          vmid: z.union([z.string(), z.number()]).describe("VM or container ID"),
          rate: z.number().int().min(1).optional().describe("Bandwidth limit in MB/s"),
          comment: z.string().max(1024).optional(),
          disable: z.boolean().optional(),
          type: z.enum(["local", "remote"]).default("local"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "create_replication_job", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {
          id: args.id,
          target: args.target,
          schedule: args.schedule,
          vmid: args.vmid,
          type: args.type,
        };
        if (args.rate !== undefined) body.rate = args.rate;
        if (args.comment) body.comment = args.comment;
        if (args.disable !== undefined) body.disable = args.disable ? 1 : 0;
        await ctx.client.post(paths.replication(), body);
        return jsonResult(`Replication job ${args.id} created.`, { id: args.id });
      }),
  );

  server.registerTool(
    "update_replication_job",
    {
      title: "Update replication job",
      description: "Update an existing replication job (schedule, rate, disable, comment).",
      inputSchema: z
        .object({
          id: z.string().min(1),
          schedule: z.string().optional(),
          rate: z.number().int().optional(),
          comment: z.string().optional(),
          disable: z.boolean().optional(),
          delete: z.array(z.string()).optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "update_replication_job", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "id" || v === undefined) continue;
          if (k === "delete" && Array.isArray(v)) body.delete = v.join(",");
          else body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.put(paths.replicationJob(args.id as string), body);
        return jsonResult(`Replication ${args.id} updated.`, { id: args.id });
      }),
  );

  server.registerTool(
    "delete_replication_job",
    {
      title: "Delete replication job",
      description:
        "Delete a replication job. Existing replicated snapshots are kept unless explicitly pruned. DESTRUCTIVE — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          id: z.string().min(1),
          force: z.boolean().optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ id, force, confirm }) =>
      runTool(ctx, "delete_replication_job", { id, force, confirm }, async () => {
        const params: Record<string, unknown> = {};
        if (force) params.force = 1;
        await ctx.client.delete(paths.replicationJob(id), params);
        return jsonResult(`Replication ${id} deleted.`, { id });
      }),
  );
}