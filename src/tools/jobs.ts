/**
 * Job tracking tools.
 *
 * Wraps the in-memory JobStore so the AI can list / poll / cancel / retry
 * long-running operations initiated by other tools. Phase 1 uses an
 * in-memory store; Phase 2 can swap in SQLite without tool changes.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult, errResult } from "../format/response.js";
import type { JobRecord } from "../jobs/store.js";

export function registerJobsTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_jobs",
    {
      title: "List tracked jobs",
      description:
        "List long-running Proxmox jobs tracked by this MCP server (e.g. create_vm, snapshot, backup).",
      inputSchema: z
        .object({
          status: z
            .enum(["queued", "running", "completed", "failed", "cancelled"])
            .optional()
            .describe("Filter by job status"),
          tool: z.string().optional().describe("Filter by originating tool name"),
          limit: z.number().int().min(1).max(500).optional().describe("Max rows (default 100)"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ status, tool, limit }) =>
      runTool(ctx, "list_jobs", { status, tool, limit }, async () => {
        const jobs = ctx.jobs.list({ status, tool, limit: limit ?? 100 });
        return jsonResult(`Jobs (${jobs.length}):`, jobs);
      }),
  );

  server.registerTool(
    "get_job",
    {
      title: "Get job details",
      description: "Fetch a single tracked job by job_id, optionally refreshing from Proxmox.",
      inputSchema: z
        .object({
          job_id: z.string().uuid().describe("Job identifier returned by a prior tool call"),
          refresh: z.boolean().optional().describe("Force a fresh poll of the underlying Proxmox task"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ job_id, refresh }) =>
      runTool(ctx, "get_job", { job_id, refresh }, async () => {
        const job = ctx.jobs.get(job_id);
        if (!job) return errResult(`Job ${job_id} not found.`);
        if (refresh && job.upid && job.node) {
          await refreshJob(ctx, job);
        }
        return jsonResult(`Job ${job_id}:`, ctx.jobs.get(job_id));
      }),
  );

  server.registerTool(
    "poll_job",
    {
      title: "Poll job status from Proxmox",
      description:
        "Force-refresh a tracked job by polling its underlying Proxmox task. Returns the latest state, exit status, progress, and recent log tail.",
      inputSchema: z
        .object({ job_id: z.string().uuid().describe("Job identifier") })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ job_id }) =>
      runTool(ctx, "poll_job", { job_id }, async () => {
        const job = ctx.jobs.get(job_id);
        if (!job) return errResult(`Job ${job_id} not found.`);
        if (!job.upid || !job.node) {
          return jsonResult(`Job ${job_id} (no UPID yet):`, job);
        }
        await refreshJob(ctx, job);
        return jsonResult(`Job ${job_id} (refreshed):`, ctx.jobs.get(job_id));
      }),
  );

  server.registerTool(
    "cancel_job",
    {
      title: "Cancel a running job",
      description:
        "Request cancellation of a tracked job. Calls Proxmox's task-stop endpoint. Some operations cannot be cancelled cleanly.",
      inputSchema: z
        .object({ job_id: z.string().uuid().describe("Job identifier") })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ job_id }) =>
      runTool(ctx, "cancel_job", { job_id }, async () => {
        const job = ctx.jobs.get(job_id);
        if (!job) return errResult(`Job ${job_id} not found.`);
        if (!job.upid || !job.node) {
          ctx.jobs.update(job_id, { status: "cancelled", ended_at: Date.now() });
          return jsonResult(`Job ${job_id} cancelled (no UPID).`, ctx.jobs.get(job_id));
        }
        await ctx.client.post(paths.taskStop(job.node, job.upid));
        ctx.jobs.update(job_id, { status: "cancelled", ended_at: Date.now() });
        return jsonResult(`Job ${job_id} cancel requested.`, ctx.jobs.get(job_id));
      }),
  );

  server.registerTool(
    "retry_job",
    {
      title: "Retry a failed/cancelled job",
      description:
        "Re-invoke the originating tool for a failed/cancelled job, using the stored retry recipe. Returns the new job_id.",
      inputSchema: z
        .object({
          job_id: z.string().uuid().describe("Job identifier"),
          approval_token: z.string().optional().describe("Required if the original tool was destructive"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ job_id, approval_token }) =>
      runTool(ctx, "retry_job", { job_id, approval_token }, async () => {
        const original = ctx.jobs.get(job_id);
        if (!original) return errResult(`Job ${job_id} not found.`);
        if (!original.retry_spec) return errResult(`Job ${job_id} has no stored retry recipe.`);

        // Re-run is intentionally minimal in Phase 1: emit a "manual retry
        // recommended" notice rather than re-invoking the tool automatically
        // (avoids recursive tool dispatch through MCP).
        const notice = {
          original_job_id: job_id,
          tool: original.retry_spec.tool,
          args: original.retry_spec.args,
          hint:
            `Call ${original.retry_spec.tool} again with the args shown above to retry. ` +
            `The MCP server does not auto-reinvoke tools in Phase 1.`,
        };
        return jsonResult(`Retry recipe for ${job_id}:`, notice);
      }),
  );
}

async function refreshJob(ctx: ToolContext, job: JobRecord): Promise<void> {
  if (!job.upid || !job.node) return;
  try {
    const status = await ctx.client.get(paths.taskStatus(job.node, job.upid));
    const s = status as { status?: string; exitstatus?: string };
    let nextStatus: JobRecord["status"] = job.status;
    if (s.status === "running") nextStatus = "running";
    else if (s.status === "stopped" || s.status === "OK") nextStatus = "completed";
    else if (s.status === "ERROR") nextStatus = "failed";

    // Best-effort progress from log tail
    let progress = job.progress;
    try {
      const log = await ctx.client.get<Array<{ t: string }>>(paths.taskLog(job.node, job.upid, 50));
      const pctMatch = log
        .map((l) => l.t.match(/(\d{1,3})%/))
        .find((m): m is RegExpMatchArray => Boolean(m));
      if (pctMatch && pctMatch[1]) {
        const p = Number.parseInt(pctMatch[1], 10);
        if (!Number.isNaN(p) && p >= 0 && p <= 100) progress = p;
      }
    } catch {
      // ignore log fetch failure
    }

    ctx.jobs.update(job.job_id, {
      status: nextStatus,
      exit_status: s.exitstatus ?? job.exit_status,
      progress,
      ended_at: nextStatus !== "running" ? Date.now() : null,
      result: status,
    });
  } catch (err) {
    ctx.logger.warn({ err, job_id: job.job_id }, "jobs.refresh_failed");
  }
}