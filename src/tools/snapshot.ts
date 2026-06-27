/**
 * Snapshot tools: list, create, delete, rollback.
 *
 * Snapshots work for both QEMU VMs and LXC containers via the same
 * `/nodes/{node}/{type}/{vmid}/snapshot` namespace.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";
import { trackUpid } from "./helpers.js";

const VmTypeSchema = z.enum(["qemu", "lxc"]);

export function registerSnapshotTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_snapshots",
    {
      title: "List snapshots",
      description: "List all snapshots for a QEMU VM or LXC container.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Host node name"),
          vmid: z.string().regex(/^\d+$/).describe("VM or container ID"),
          vm_type: VmTypeSchema.default("qemu").describe("'qemu' for VMs, 'lxc' for containers"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid, vm_type }) =>
      runTool(ctx, "list_snapshots", { node, vmid, vm_type }, async () => {
        const data = await ctx.client.get(paths.snapshotList(node, vm_type, vmid));
        return jsonResult(`Snapshots for ${vm_type} ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "create_snapshot",
    {
      title: "Create snapshot",
      description:
        "Take a snapshot of a QEMU VM (optionally including RAM state) or LXC container.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Host node name"),
          vmid: z.string().regex(/^\d+$/).describe("VM or container ID"),
          snapname: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[a-zA-Z0-9_\-]+$/)
            .describe("Snapshot name (no spaces)"),
          description: z.string().max(1024).optional().describe("Optional description"),
          vmstate: z
            .boolean()
            .optional()
            .describe("Include VM RAM state (QEMU only — ignored for LXC)"),
          vm_type: VmTypeSchema.default("qemu"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, snapname, description, vmstate, vm_type }) =>
      runTool(ctx, "create_snapshot", { node, vmid, snapname, vm_type }, async () => {
        const body: Record<string, unknown> = { snapname };
        if (description !== undefined) body.description = description;
        if (vmstate !== undefined && vm_type === "qemu") body.vmstate = vmstate ? 1 : 0;
        const upid = await ctx.client.post<string>(
          paths.snapshotCreate(node, vm_type, vmid),
          body,
        );
        const job = trackUpid(ctx, upid, { node, tool: "create_snapshot", args: { node, vmid, snapname, vm_type } });
        return jsonResult(`Snapshot creation started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "delete_snapshot",
    {
      title: "Delete snapshot",
      description:
        "Delete a snapshot from a VM or container. Requires either dangerously_allow_destructive or approval_token.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          snapname: z.string().min(1).describe("Snapshot name to delete"),
          force: z.boolean().optional().describe("Force removal even if removal is not safe"),
          vm_type: VmTypeSchema.default("qemu"),
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
    async ({ node, vmid, snapname, force, vm_type, approval_token }) =>
      runTool(
        ctx,
        "delete_snapshot",
        { node, vmid, snapname, vm_type, force, approval_token },
        async () => {
          const params: Record<string, unknown> = {};
          if (force) params.force = 1;
          const upid = await ctx.client.delete<string>(
            paths.snapshotDelete(node, vm_type, vmid, snapname),
            params,
          );
          const job = trackUpid(ctx, upid, { node, tool: "delete_snapshot", args: { node, vmid, snapname, vm_type } });
          return jsonResult(`Snapshot deletion started.`, { job_id: job.job_id, upid });
        },
      ),
  );

  server.registerTool(
    "rollback_snapshot",
    {
      title: "Rollback to snapshot",
      description:
        "Revert a VM or container to a previous snapshot state. VM/container will be stopped first. Requires approval_token or dangerously_allow_destructive.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          snapname: z.string().min(1).describe("Snapshot name to roll back to"),
          vm_type: VmTypeSchema.default("qemu"),
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
    async ({ node, vmid, snapname, vm_type, approval_token }) =>
      runTool(
        ctx,
        "rollback_snapshot",
        { node, vmid, snapname, vm_type, approval_token },
        async () => {
          const upid = await ctx.client.post<string>(
            paths.snapshotRollback(node, vm_type, vmid, snapname),
          );
          const job = trackUpid(ctx, upid, { node, tool: "rollback_snapshot", args: { node, vmid, snapname, vm_type } });
          return jsonResult(`Snapshot rollback started.`, { job_id: job.job_id, upid });
        },
      ),
  );
}