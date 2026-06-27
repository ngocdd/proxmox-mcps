/**
 * Container Migration & storage tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";
import { trackUpid } from "../helpers.js";

export function registerContainerMigrationTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "migrate_container",
    {
      title: "Migrate container between nodes",
      description:
        "Migrate an LXC container to a different node (online/offline). With online=true the container keeps running.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Source node"),
          vmid: z.string().regex(/^\d+$/),
          target_node: z.string().optional(),
          online: z.boolean().optional(),
          with_local_disks: z.boolean().optional(),
          restart: z.boolean().optional().describe("Restart after offline migration"),
          timeout: z.number().int().min(0).max(3600).optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, target_node, online, with_local_disks, restart, timeout }) =>
      runTool(
        ctx,
        "migrate_container",
        { node, vmid, target_node, online, with_local_disks, restart, timeout },
        async () => {
          const body: Record<string, unknown> = {};
          if (target_node) body.target = target_node;
          if (online !== undefined) body.online = online ? 1 : 0;
          if (with_local_disks !== undefined) body["with-local-disks"] = with_local_disks ? 1 : 0;
          if (restart !== undefined) body.restart = restart ? 1 : 0;
          if (timeout !== undefined) body.timeout = timeout;
          const upid = await ctx.client.post<string>(paths.lxcMigrate(node, vmid), body);
          const job = trackUpid(ctx, upid, {
            node,
            tool: "migrate_container",
            args: { node, vmid, target_node, online },
          });
          return jsonResult(`Container ${vmid} migration started.`, { job_id: job.job_id, upid });
        },
      ),
  );

  server.registerTool(
    "move_container_disk",
    {
      title: "Move container disk",
      description: "Move a container volume to a different storage pool.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          disk: z.string().min(1).describe("Volume identifier (e.g. rootfs, mp0)"),
          storage: z.string().min(1),
          format: z.enum(["raw", "qcow2", "vmdk"]).optional(),
          delete_source: z.boolean().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, disk, storage, format, delete_source }) =>
      runTool(
        ctx,
        "move_container_disk",
        { node, vmid, disk, storage, format, delete_source },
        async () => {
          const body: Record<string, unknown> = { storage };
          if (format) body.format = format;
          if (delete_source !== undefined) body.delete = delete_source ? 1 : 0;
          const upid = await ctx.client.post<string>(paths.lxcMoveDisk(node, vmid, disk), body);
          const job = trackUpid(ctx, upid, {
            node,
            tool: "move_container_disk",
            args: { node, vmid, disk, storage },
          });
          return jsonResult(`Container ${vmid} ${disk} move started.`, { job_id: job.job_id, upid });
        },
      ),
  );

  server.registerTool(
    "convert_container_to_template",
    {
      title: "Convert container to template",
      description:
        "Convert an LXC container into a template. HIGH RISK — original becomes read-only. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, confirm }) =>
      runTool(
        ctx,
        "convert_container_to_template",
        { node, vmid, confirm },
        async () => {
          const upid = await ctx.client.post<string>(paths.lxcTemplate(node, vmid));
          const job = trackUpid(ctx, upid, {
            node,
            tool: "convert_container_to_template",
            args: { node, vmid },
          });
          return jsonResult(`Container ${vmid} template conversion started.`, { job_id: job.job_id, upid });
        },
      ),
  );

  server.registerTool(
    "unlink_container_disk",
    {
      title: "Detach container volume",
      description: "Detach an LXC volume (file remains on storage pool).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          volume: z.string().min(1).describe("Volume identifier (e.g. rootfs, mp0)"),
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
    async ({ node, vmid, volume, force }) =>
      runTool(ctx, "unlink_container_disk", { node, vmid, volume, force }, async () => {
        const params: Record<string, unknown> = {};
        if (force) params.force = 1;
        const upid = await ctx.client.post<string>(paths.lxcUnlink(node, vmid, volume), params);
        const job = trackUpid(ctx, upid, {
          node,
          tool: "unlink_container_disk",
          args: { node, vmid, volume, force },
        });
        return jsonResult(`Container ${vmid} volume ${volume} unlink started.`, { job_id: job.job_id, upid });
      }),
  );
}