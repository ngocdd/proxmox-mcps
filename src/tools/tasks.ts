/**
 * Task tools: list_tasks, get_task, get_task_log.
 *
 * A Proxmox "task" is one UPID — any long-running operation. We expose a
 * thin wrapper around the Proxmox task endpoints; full job tracking with
 * retries/cancellation lives in tools/jobs.ts.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerTasksTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_tasks",
    {
      title: "List recent cluster tasks",
      description:
        "List recent Proxmox tasks cluster-wide (UPIDs). Useful for finding background work and diagnosing failures.",
      inputSchema: z
        .object({
          vmid: z
            .string()
            .regex(/^\d+$/)
            .optional()
            .describe("Filter by VM or container ID"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .describe("Maximum number of tasks to return (default 50)"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ vmid, limit }) =>
      runTool(ctx, "list_tasks", { vmid, limit }, async () => {
        const data = await ctx.client.get<unknown[]>(paths.clusterTasks());
        const filtered = (data as Array<Record<string, unknown>>).filter((t) => {
          if (!vmid) return true;
          return String(t.id ?? "").includes(`:${vmid}`);
        });
        return jsonResult(`Tasks (showing ${Math.min(filtered.length, limit ?? 50)}):`, filtered.slice(0, limit ?? 50));
      }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get task status",
      description:
        "Get the current status of a Proxmox task by its UPID (e.g. 'UPID:pve:000B5C66:...').",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Node that owns the task"),
          upid: z.string().min(1).describe("Task UPID"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, upid }) =>
      runTool(ctx, "get_task", { node, upid }, async () => {
        const data = await ctx.client.get(paths.taskStatus(node, upid));
        return jsonResult(`Task ${upid} status:`, data);
      }),
  );

  server.registerTool(
    "get_task_log",
    {
      title: "Get task log",
      description: "Stream log lines from a Proxmox task (UPID). Useful for diagnosing failures.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Node that owns the task"),
          upid: z.string().min(1).describe("Task UPID"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(5000)
            .optional()
            .describe("Number of log lines (default 100)"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, upid, limit }) =>
      runTool(ctx, "get_task_log", { node, upid, limit }, async () => {
        const data = await ctx.client.get(paths.taskLog(node, upid, limit ?? 100));
        return jsonResult(`Task ${upid} log:`, data);
      }),
  );
}