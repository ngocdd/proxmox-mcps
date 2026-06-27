/**
 * Cluster Backup Schedule tools (vzdump schedule jobs).
 *
 * Distinct from ad-hoc `create_backup` in tools/backup.ts — these are
 * scheduled jobs that Proxmox runs automatically.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";
import { trackUpid } from "./helpers.js";

const ScheduleSchema = z
  .string()
  .describe("Calendar event: 'Mon..Sun', '00:00', or a calendar event spec");

export function registerBackupScheduleTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_backup_jobs",
    {
      title: "List backup schedule jobs",
      description: "List all scheduled vzdump backup jobs (cluster-wide).",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "list_backup_jobs", {}, async () => {
        const data = await ctx.client.get(paths.backupJobs());
        return jsonResult(`Backup jobs (${Array.isArray(data) ? data.length : "?"}):`, data);
      }),
  );

  server.registerTool(
    "get_backup_job",
    {
      title: "Get backup schedule job",
      description: "Get a single scheduled backup job.",
      inputSchema: z
        .object({ id: z.string().min(1).describe("Job ID") })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) =>
      runTool(ctx, "get_backup_job", { id }, async () => {
        const data = await ctx.client.get(paths.backupJob(id));
        return jsonResult(`Backup job ${id}:`, data);
      }),
  );

  server.registerTool(
    "get_backup_job_included",
    {
      title: "Get backup job included guests",
      description: "List the VMs/containers that a scheduled backup job would capture.",
      inputSchema: z
        .object({ id: z.string().min(1) })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) =>
      runTool(ctx, "get_backup_job_included", { id }, async () => {
        const data = await ctx.client.get(paths.backupJobIncluded(id));
        return jsonResult(`Guests included in backup job ${id}:`, data);
      }),
  );

  server.registerTool(
    "create_backup_job",
    {
      title: "Create backup schedule",
      description: "Schedule a recurring vzdump backup job.",
      inputSchema: z
        .object({
          id: z.string().min(1).regex(/^[a-zA-Z0-9_\-]+$/).describe("Job ID"),
          schedule: ScheduleSchema,
          storage: z.string().min(1).describe("Target storage"),
          vmid: z.string().optional().describe("Specific VM/CT (or 'all' for everything)"),
          all: z.boolean().optional().describe("Backup all VMs/containers"),
          exclude: z.string().optional().describe("Comma-separated list of VMIDs to exclude"),
          pool: z.string().optional().describe("Pool filter"),
          mode: z.enum(["snapshot", "suspend", "stop"]).default("snapshot"),
          compress: z.enum(["0", "gzip", "lz4", "zstd"]).default("zstd"),
          enabled: z.boolean().default(true),
          notes: z.string().max(1024).optional(),
          notification_mode: z.enum(["notification-system", "auto", "legacy-sendmail"]).optional(),
          mailnotification: z.enum(["always", "failure"]).optional(),
          mailto: z.string().optional(),
          prune_backups: z.string().optional().describe("Retention options, e.g. 'keep-last=7,keep-daily=14'"),
          bwlimit: z.number().int().min(0).optional().describe("Bandwidth limit in KB/s"),
          ionice: z.number().int().min(0).max(8).optional(),
          lockwait: z.number().int().min(0).optional(),
          stopwait: z.number().int().min(0).optional(),
          maxfiles: z.number().int().min(1).optional().describe("DEPRECATED — use prune_backups"),
          next_run: z.string().optional(),
          comment: z.string().max(1024).optional(),
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
      runTool(ctx, "create_backup_job", args as Record<string, unknown>, async () => {
        const body = buildBackupBody(args);
        await ctx.client.post(paths.backupJobs(), body);
        return jsonResult(`Backup job ${args.id} created.`, { id: args.id });
      }),
  );

  server.registerTool(
    "update_backup_job",
    {
      title: "Update backup schedule",
      description: "Update an existing scheduled backup job.",
      inputSchema: z
        .object({
          id: z.string().min(1),
          schedule: ScheduleSchema.optional(),
          storage: z.string().optional(),
          vmid: z.string().optional(),
          all: z.boolean().optional(),
          exclude: z.string().optional(),
          pool: z.string().optional(),
          mode: z.enum(["snapshot", "suspend", "stop"]).optional(),
          compress: z.enum(["0", "gzip", "lz4", "zstd"]).optional(),
          enabled: z.boolean().optional(),
          notes: z.string().optional(),
          notification_mode: z.enum(["notification-system", "auto", "legacy-sendmail"]).optional(),
          mailnotification: z.enum(["always", "failure"]).optional(),
          mailto: z.string().optional(),
          prune_backups: z.string().optional(),
          bwlimit: z.number().int().optional(),
          ionice: z.number().int().optional(),
          lockwait: z.number().int().optional(),
          stopwait: z.number().int().optional(),
          maxfiles: z.number().int().optional(),
          next_run: z.string().optional(),
          comment: z.string().optional(),
          delete: z.array(z.string()).optional(),
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
      runTool(ctx, "update_backup_job", args as Record<string, unknown>, async () => {
        const { id, delete: del, ...rest } = args;
        const body = buildBackupBody(rest as Record<string, unknown>);
        if (del) body.delete = del.join(",");
        await ctx.client.put(paths.backupJob(id as string), body);
        return jsonResult(`Backup job ${id} updated.`, { id });
      }),
  );

  server.registerTool(
    "delete_backup_job",
    {
      title: "Delete backup schedule",
      description: "Delete a scheduled backup job (existing backups are not deleted).",
      inputSchema: z
        .object({
          id: z.string().min(1),
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
    async ({ id, approval_token }) =>
      runTool(ctx, "delete_backup_job", { id, approval_token }, async () => {
        await ctx.client.delete(paths.backupJob(id));
        return jsonResult(`Backup job ${id} deleted.`, { id });
      }),
  );

  server.registerTool(
    "run_backup_job",
    {
      title: "Run backup schedule now",
      description: "Trigger a scheduled backup job to run immediately (bypasses the schedule).",
      inputSchema: z
        .object({ id: z.string().min(1) })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ id }) =>
      runTool(ctx, "run_backup_job", { id }, async () => {
        const upid = await ctx.client.post<string>(paths.runBackupJob(id));
        const job = trackUpid(ctx, upid, {
          node: "",
          tool: "run_backup_job",
          args: { id },
        });
        return jsonResult(`Backup job ${id} triggered.`, { job_id: job.job_id, upid });
      }),
  );
}

function buildBackupBody(args: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null || k === "id" || k === "delete") continue;
    if (typeof v === "boolean") {
      body[k] = v ? 1 : 0;
    } else {
      body[k] = v;
    }
  }
  return body;
}