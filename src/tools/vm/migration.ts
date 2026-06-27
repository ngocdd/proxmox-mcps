/**
 * VM Migration & storage tools: migrate, move-disk, template, unlink.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";
import { trackUpid } from "../helpers.js";

export function registerVmMigrationTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "migrate_vm",
    {
      title: "Migrate VM between nodes",
      description:
        "Migrate a VM to a different node (live or offline). With online=true the VM keeps running during migration.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Source node"),
          vmid: z.string().regex(/^\d+$/),
          target_node: z.string().optional().describe("Target node (omit for online-migration-only)"),
          online: z.boolean().optional().describe("Live-migrate (online=true)"),
          with_local_disks: z.boolean().optional().describe("Migrate local disks (slower)"),
          force: z.boolean().optional().describe("Force migration even if local disks present"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, target_node, online, with_local_disks, force }) =>
      runTool(
        ctx,
        "migrate_vm",
        { node, vmid, target_node, online, with_local_disks, force },
        async () => {
          const body: Record<string, unknown> = {};
          if (target_node) body.target = target_node;
          if (online !== undefined) body.online = online ? 1 : 0;
          if (with_local_disks !== undefined) body["with-local-disks"] = with_local_disks ? 1 : 0;
          if (force !== undefined) body.force = force ? 1 : 0;
          const upid = await ctx.client.post<string>(paths.qemuMigrate(node, vmid), body);
          const job = trackUpid(ctx, upid, {
            node,
            tool: "migrate_vm",
            args: { node, vmid, target_node, online },
          });
          return jsonResult(`VM ${vmid} migration started.`, { job_id: job.job_id, upid });
        },
      ),
  );

  server.registerTool(
    "move_vm_disk",
    {
      title: "Move VM disk",
      description:
        "Move a VM's disk to a different storage pool. Useful for migrating off slow disks or balancing storage.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          disk: z.string().min(1).describe("Disk identifier (e.g. scsi0, virtio0)"),
          storage: z.string().min(1).describe("Target storage"),
          format: z.enum(["raw", "qcow2", "vmdk"]).optional(),
          delete_source: z.boolean().optional().describe("Remove the source disk after copy"),
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
        "move_vm_disk",
        { node, vmid, disk, storage, format, delete_source },
        async () => {
          const body: Record<string, unknown> = { storage };
          if (format) body.format = format;
          if (delete_source !== undefined) body.delete = delete_source ? 1 : 0;
          const upid = await ctx.client.post<string>(paths.qemuMoveDisk(node, vmid, disk), body);
          const job = trackUpid(ctx, upid, {
            node,
            tool: "move_vm_disk",
            args: { node, vmid, disk, storage },
          });
          return jsonResult(`VM ${vmid} disk ${disk} move started.`, { job_id: job.job_id, upid });
        },
      ),
  );

  server.registerTool(
    "convert_vm_to_template",
    {
      title: "Convert VM to template",
      description:
        "Convert a VM into a Proxmox template (subsequent clones can use it as a source). HIGH RISK — original VM becomes read-only.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
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
    async ({ node, vmid, approval_token }) =>
      runTool(
        ctx,
        "convert_vm_to_template",
        { node, vmid, approval_token },
        async () => {
          const upid = await ctx.client.post<string>(paths.qemuTemplate(node, vmid));
          const job = trackUpid(ctx, upid, {
            node,
            tool: "convert_vm_to_template",
            args: { node, vmid },
          });
          return jsonResult(`VM ${vmid} template conversion started.`, { job_id: job.job_id, upid });
        },
      ),
  );

  server.registerTool(
    "unlink_vm_disk",
    {
      title: "Detach VM disk",
      description:
        "Detach a disk from a VM (the disk file remains on the storage pool). Use move_vm_disk to migrate; use delete via Proxmox UI to actually remove.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          disk: z.string().min(1).describe("Disk identifier (e.g. scsi0)"),
          force: z.boolean().optional().describe("Force-unlink even if disk in use"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, disk, force }) =>
      runTool(ctx, "unlink_vm_disk", { node, vmid, disk, force }, async () => {
        const params: Record<string, unknown> = {};
        if (force) params.force = 1;
        const upid = await ctx.client.post<string>(
          paths.qemuUnlink(node, vmid, disk),
          params,
        );
        const job = trackUpid(ctx, upid, {
          node,
          tool: "unlink_vm_disk",
          args: { node, vmid, disk, force },
        });
        return jsonResult(`VM ${vmid} disk ${disk} unlink started.`, { job_id: job.job_id, upid });
      }),
  );
}