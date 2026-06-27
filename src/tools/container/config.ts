/**
 * Container Config tools: update_container_config, resize_container_disk, move_container_volume.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";
import { trackUpid } from "../helpers.js";

export function registerContainerConfigTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "update_container_config",
    {
      title: "Update container config",
      description:
        "Patch one or more LXC container configuration keys (cores, memory, net0, features, etc.).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          config: z
            .record(z.union([z.string(), z.number(), z.boolean()]))
            .describe("Config keys to update, e.g. {\"cores\":2,\"memory\":1024}"),
        })
        .passthrough(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(ctx, "update_container_config", args as Record<string, unknown>, async () => {
        const config = (args.config ?? {}) as Record<string, unknown>;
        if (Object.keys(config).length === 0) {
          return jsonResult(`No changes.`, { node: args.node, vmid: args.vmid });
        }
        const upid = await ctx.client.post<string>(paths.lxcConfig(args.node, args.vmid), config);
        const job = trackUpid(ctx, upid, {
          node: args.node,
          tool: "update_container_config",
          args: { node: args.node, vmid: args.vmid, keys: Object.keys(config) },
        });
        return jsonResult(`Container ${args.vmid} config update started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "resize_container_disk",
    {
      title: "Resize container disk",
      description:
        "Resize an LXC container volume (e.g. rootfs, mp0). Use '+N' for relative growth, or absolute size like '20G'.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          disk: z.string().min(1).describe("Disk/volume identifier (default 'rootfs')"),
          size: z.string().min(1).describe("New size (e.g. '20G', '+10G')"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, disk, size }) =>
      runTool(ctx, "resize_container_disk", { node, vmid, disk, size }, async () => {
        const upid = await ctx.client.put<string>(paths.lxcResize(node, vmid, disk), { size });
        const job = trackUpid(ctx, upid, {
          node,
          tool: "resize_container_disk",
          args: { node, vmid, disk, size },
        });
        return jsonResult(`Container ${vmid} ${disk} resize started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "move_container_volume",
    {
      title: "Move container volume",
      description:
        "Move an LXC volume (rootfs or mountpoint) to a different storage. Useful for migrating off slow disks.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          volume: z.string().min(1).describe("Volume identifier (e.g. rootfs, mp0)"),
          storage: z.string().min(1).describe("Target storage pool"),
          format: z.enum(["raw", "qcow2", "vmdk"]).optional().describe("Target disk format"),
          delete_source: z.boolean().optional().describe("Remove the source volume after copy"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, volume, storage, format, delete_source }) =>
      runTool(
        ctx,
        "move_container_volume",
        { node, vmid, volume, storage, format, delete_source },
        async () => {
          const body: Record<string, unknown> = { storage };
          if (format) body.format = format;
          if (delete_source !== undefined) body["delete-source"] = delete_source ? 1 : 0;
          const upid = await ctx.client.post<string>(
            paths.lxcMoveVolume(node, vmid, volume),
            body,
          );
          const job = trackUpid(ctx, upid, {
            node,
            tool: "move_container_volume",
            args: { node, vmid, volume, storage },
          });
          return jsonResult(`Container ${vmid} ${volume} move started.`, { job_id: job.job_id, upid });
        },
      ),
  );
}