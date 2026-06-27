/**
 * Backup tools: list, create, restore, delete, prune.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";
import { trackUpid } from "./helpers.js";

const CompressSchema = z.enum(["0", "gzip", "lz4", "zstd"]).default("zstd");
const ModeSchema = z.enum(["snapshot", "suspend", "stop"]).default("snapshot");

export function registerBackupTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_backups",
    {
      title: "List backups",
      description:
        "List vzdump backup files cluster-wide. Filter by node, storage pool, or VM ID.",
      inputSchema: z
        .object({
          node: z.string().optional().describe("Filter by node"),
          storage: z.string().optional().describe("Filter by storage pool"),
          vmid: z.string().regex(/^\d+$/).optional().describe("Filter by VM/container ID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, storage, vmid }) =>
      runTool(ctx, "list_backups", { node, storage, vmid }, async () => {
        // Discover candidate storage pools
        const allStorage = (await ctx.client.get<Array<{ storage: string; content?: string }>>(
          paths.storage(),
        )) as Array<{ storage: string; content?: string }>;
        const backupStorages = allStorage.filter((s) => (s.content ?? "").includes("backup"));

        const nodesToScan = node
          ? [node]
          : ((await ctx.client.get<Array<{ node: string }>>(paths.nodes())) as Array<{ node: string }>).map(
              (n) => n.node,
            );

        const results: Array<{ node: string; storage: string; entries: unknown[] }> = [];
        for (const n of nodesToScan) {
          for (const s of backupStorages) {
            try {
              let entries = (await ctx.client.get<unknown[]>(
                paths.nodeStorageContent(n, s.storage, "backup"),
              )) as Array<{ vmid?: number }>;
              if (vmid) {
                entries = entries.filter((e) => String((e as { vmid?: number }).vmid ?? "") === vmid);
              }
              if (entries.length > 0) results.push({ node: n, storage: s.storage, entries });
            } catch {
              // Skip unreadable storages
            }
          }
        }
        return jsonResult(`Backups (${results.flatMap((r) => r.entries).length} files):`, results);
      }),
  );

  server.registerTool(
    "create_backup",
    {
      title: "Create backup",
      description:
        "Trigger a vzdump backup of a VM or container to a target storage pool.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Host node name"),
          vmid: z.string().regex(/^\d+$/).describe("VM or container ID"),
          storage: z.string().min(1).describe("Target storage pool"),
          compress: CompressSchema.describe("Compression algorithm"),
          mode: ModeSchema.describe("Backup mode: snapshot, suspend, or stop"),
          notes: z.string().max(1024).optional().describe("Optional notes (Proxmox 8+)"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, storage, compress, mode, notes }) =>
      runTool(ctx, "create_backup", { node, vmid, storage, mode }, async () => {
        const body: Record<string, unknown> = {
          vmid,
          storage,
          compress,
          mode,
        };
        if (notes) body.notes = notes;
        const upid = await ctx.client.post<string>(paths.vzdump(node), body);
        const job = trackUpid(ctx, upid, { node, tool: "create_backup", args: { node, vmid, storage, mode } });
        return jsonResult(`Backup started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "restore_backup",
    {
      title: "Restore backup",
      description:
        "Restore a vzdump archive as a new VM/container. Requires approval_token for destructive operations.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Target node for the restored VM/container"),
          archive: z.string().min(1).describe("Backup volume ID (e.g. 'backup:backup/vzdump-qemu-100-...')"),
          vmid: z.string().regex(/^\d+$/).describe("New VM/container ID for the restored machine"),
          storage: z.string().optional().describe("Target storage for disks"),
          unique: z.boolean().default(true).describe("Generate unique MAC addresses"),
          approval_token: z.string().optional().describe("Approval token for high-risk operation"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, archive, vmid, storage, unique, approval_token }) =>
      runTool(
        ctx,
        "restore_backup",
        { node, archive, vmid, storage, unique, approval_token },
        async () => {
          // Heuristic: vzdump-qemu-* vs vzdump-lxc-*
          const isLxc = archive.includes("lxc");
          const body: Record<string, unknown> = {
            archive,
            vmid,
            unique: unique ? 1 : 0,
          };
          if (storage) body.storage = storage;
          const endpoint = isLxc ? paths.lxc(node) : paths.qemu(node);
          const upid = await ctx.client.post<string>(endpoint, body);
          const job = trackUpid(ctx, upid, { node, tool: "restore_backup", args: { node, archive, vmid } });
          return jsonResult(`Restore started.`, { job_id: job.job_id, upid });
        },
      ),
  );

  server.registerTool(
    "delete_backup",
    {
      title: "Delete backup file",
      description:
        "Permanently delete a vzdump backup file. Requires approval_token for destructive operation.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          storage: z.string().min(1),
          volid: z.string().min(1).describe("Backup volume ID"),
          approval_token: z.string().optional().describe("Approval token for destructive operation"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, storage, volid, approval_token }) =>
      runTool(ctx, "delete_backup", { node, storage, volid, approval_token }, async () => {
        await ctx.client.delete(paths.storageContent(node, storage, volid));
        return jsonResult(`Backup deleted.`, { node, storage, volid });
      }),
  );

  server.registerTool(
    "prune_backups",
    {
      title: "Prune backups by retention",
      description:
        "Apply a prune schedule (e.g. 'keep-last=7,keep-daily=14,keep-weekly=4') to a storage pool (Proxmox 8+).",
      inputSchema: z
        .object({
          storage: z.string().min(1).describe("Target storage pool"),
          prune_backups: z
            .string()
            .min(1)
            .describe("Prune options (e.g. 'keep-last=7,keep-daily=14,keep-weekly=4')"),
          type: z.string().optional().describe("Filter by content type (e.g. 'qemu', 'lxc')"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ storage, prune_backups, type }) =>
      runTool(ctx, "prune_backups", { storage, type }, async () => {
        const body: Record<string, unknown> = { prune_backups };
        if (type) body.type = type;
        const data = await ctx.client.post(paths.pruneBackups(storage), body);
        return jsonResult(`Prune complete.`, data);
      }),
  );
}