/**
 * Node disk management: list, init, wipe, ZFS.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";
import { trackUpid } from "./helpers.js";

export function registerNodeDisksTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_node_disks",
    {
      title: "List node disks (basic)",
      description: "Return basic disk inventory on a node.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "list_node_disks", { node }, async () => {
        const data = await ctx.client.get(paths.nodeDisks(node));
        return jsonResult(`Disks on ${node}:`, data);
      }),
  );

  server.registerTool(
    "list_node_disks_detailed",
    {
      title: "List node disks (detailed)",
      description: "Return detailed disk inventory including partitions and LVM info.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          include_partitions: z.boolean().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node, include_partitions }) =>
      runTool(ctx, "list_node_disks_detailed", { node, include_partitions }, async () => {
        const params: Record<string, unknown> = {};
        if (include_partitions !== undefined) params["include-partitions"] = include_partitions ? 1 : 0;
        const data = await ctx.client.get(paths.nodeDisksList(node), params);
        return jsonResult(`Detailed disk inventory on ${node}:`, data);
      }),
  );

  server.registerTool(
    "init_node_disk",
    {
      title: "Initialize disk with GPT",
      description: "Initialize a disk with a fresh GPT partition table. DESTRUCTIVE — wipes existing data.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          disk: z.string().min(1).describe("Disk path (e.g. /dev/sdb)"),
          uuid: z.string().optional(),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, disk, uuid, approval_token }) =>
      runTool(ctx, "init_node_disk", { node, disk, uuid, approval_token }, async () => {
        const body: Record<string, unknown> = {};
        if (uuid) body.uuid = uuid;
        const upid = await ctx.client.post<string>(paths.nodeDiskInit(node, disk), body);
        const job = trackUpid(ctx, upid, { node, tool: "init_node_disk", args: { node, disk } });
        return jsonResult(`GPT init started on ${disk}.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "wipe_node_disk",
    {
      title: "Wipe disk",
      description: "Wipe a disk by writing zeros to all blocks. DESTRUCTIVE — irrecoverable.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          disk: z.string().min(1).describe("Disk path (e.g. /dev/sdb)"),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, disk, approval_token }) =>
      runTool(ctx, "wipe_node_disk", { node, disk, approval_token }, async () => {
        const upid = await ctx.client.put<string>(paths.nodeDiskWipe(node, disk));
        const job = trackUpid(ctx, upid, { node, tool: "wipe_node_disk", args: { node, disk } });
        return jsonResult(`Disk wipe started on ${disk}.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "create_node_zfs",
    {
      title: "Create ZFS pool",
      description: "Create a ZFS pool across one or more disks. DESTRUCTIVE — wipes target disks.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          name: z.string().min(1).describe("ZFS pool name"),
          devices: z.string().min(1).describe("Comma-separated disk paths (e.g. '/dev/sdb,/dev/sdc')"),
          raidlevel: z.enum(["single", "mirror", "raid10", "raidz", "raidz2", "raidz3"]).optional(),
          compression: z.enum(["on", "off", "lz4", "lzjb", "zle", "gzip", "gzip-9", "zstd", "zstd-fast"]).optional(),
          ashift: z.number().int().min(9).max(16).optional(),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, name, devices, raidlevel, compression, ashift, approval_token }) =>
      runTool(
        ctx,
        "create_node_zfs",
        { node, name, devices, raidlevel, approval_token },
        async () => {
          const body: Record<string, unknown> = { name, devices };
          if (raidlevel) body.raidlevel = raidlevel;
          if (compression) body.compression = compression;
          if (ashift !== undefined) body.ashift = ashift;
          const upid = await ctx.client.post<string>(paths.nodeDiskZfsCreate(node), body);
          const job = trackUpid(ctx, upid, {
            node,
            tool: "create_node_zfs",
            args: { node, name, devices },
          });
          return jsonResult(`ZFS pool ${name} creation started.`, { job_id: job.job_id, upid });
        },
      ),
  );
}