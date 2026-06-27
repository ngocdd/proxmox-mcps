/**
 * Storage administration: create, update, delete storage pools.
 *
 * Read-only listing already exists in tools/storage.ts (get_storage).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerStorageAdminTools(server: McpServer, ctx: ToolContext): void {
  // Note: `get_storage` is already registered by tools/storage.ts.
  // We only register admin (CRUD) operations here to avoid duplicate registration.
  server.registerTool(
    "list_storages",
    {
      title: "List storage pools",
      description: "Alias for get_storage — list all storage pools.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      runTool(ctx, "list_storages", {}, async () => {
        const data = await ctx.client.get(paths.storage());
        return jsonResult(`Storage pools:`, data);
      }),
  );

  server.registerTool(
    "create_storage",
    {
      title: "Create storage pool",
      description:
        "Create a new storage pool (lvm, zfspool, nfs, cifs, pbs, dir, btrfs, etc.). HIGH RISK — wrong config can lose data. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          storage: z.string().min(1).regex(/^[a-zA-Z0-9_\-]+$/).describe("Storage ID"),
          type: z
            .enum([
              "dir",
              "nfs",
              "cifs",
              "btrfs",
              "pbs",
              "zfspool",
              "lvm",
              "lvmthin",
              "iscsi",
              "cephfs",
              "rbd",
              "glusterfs",
              "fuse",
            ])
            .describe("Storage type"),
          content: z.array(z.enum(["iso", "vztmpl", "backup", "images", "rootdir", "snippets"])).optional(),
          nodes: z.array(z.string()).optional(),
          enable: z.boolean().default(true),
          shared: z.boolean().optional(),
          // Common fields
          path: z.string().optional(),
          export: z.string().optional(),
          server: z.string().optional(),
          export_vg: z.string().optional(),
          vgname: z.string().optional(),
          thinpool: z.string().optional(),
          pool: z.string().optional(),
          fs: z.enum(["ext4", "xfs", "zfs"]).optional(),
          options: z.string().optional(),
          maxfiles: z.number().int().min(1).optional(),
          prune_backups: z.string().optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          domain: z.string().optional(),
          datastore: z.string().optional(),
          namespace: z.string().optional(),
          fingerprint: z.string().optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "create_storage", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = { storage: args.storage, type: args.type };
        for (const [k, v] of Object.entries(args)) {
          if (k === "storage" || k === "type" || v === undefined) continue;
          if (k === "content" && Array.isArray(v)) body.content = v.join(",");
          else if (k === "nodes" && Array.isArray(v)) body.nodes = v.join(",");
          else body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.post(paths.storageCreate(), body);
        return jsonResult(`Storage ${args.storage} created.`, { storage: args.storage });
      }),
  );

  server.registerTool(
    "update_storage",
    {
      title: "Update storage pool",
      description:
        "Update an existing storage pool. HIGH RISK — may disrupt running VMs. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          storage: z.string().min(1),
          content: z.array(z.enum(["iso", "vztmpl", "backup", "images", "rootdir", "snippets"])).optional(),
          nodes: z.array(z.string()).optional(),
          enable: z.boolean().optional(),
          shared: z.boolean().optional(),
          prune_backups: z.string().optional(),
          maxfiles: z.number().int().optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "update_storage", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "storage" || v === undefined) continue;
          if (k === "content" && Array.isArray(v)) body.content = v.join(",");
          else if (k === "nodes" && Array.isArray(v)) body.nodes = v.join(",");
          else body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.put(paths.storageUpdate(args.storage as string), body);
        return jsonResult(`Storage ${args.storage} updated.`, { storage: args.storage });
      }),
  );

  server.registerTool(
    "delete_storage",
    {
      title: "Delete storage pool",
      description:
        "Delete a storage pool from Proxmox config. Underlying disk/files are NOT removed (Proxmox only un-registers the pool). DESTRUCTIVE — VMs/CTs using it lose access. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          storage: z.string().min(1),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ storage, confirm }) =>
      runTool(ctx, "delete_storage", { storage, confirm }, async () => {
        await ctx.client.delete(paths.storageUpdate(storage));
        return jsonResult(`Storage ${storage} deleted.`, { storage });
      }),
  );
}