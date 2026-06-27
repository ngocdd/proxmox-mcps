/**
 * VM (QEMU) CRUD + lifecycle tools.
 *
 * Phase 1B — covers create/clone/start/stop/shutdown/reset/reboot/delete +
 * get_vms / get_vm_config / get_vm_status.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";
import { trackUpid } from "../helpers.js";

export function registerVmCrudTools(server: McpServer, ctx: ToolContext): void {
  // ---- Read ----------------------------------------------------------------

  server.registerTool(
    "get_vms",
    {
      title: "List VMs (cluster-wide)",
      description: "List all QEMU VMs across the cluster with current status and resource usage.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "get_vms", {}, async () => {
        const data = await ctx.client.get(paths.clusterResources("vm"));
        // Filter for QEMU only (exclude LXC)
        const qemu = (data as Array<Record<string, unknown>>).filter(
          (r) => String(r.type) === "qemu",
        );
        return jsonResult(`VMs (${qemu.length}):`, qemu);
      }),
  );

  server.registerTool(
    "get_vm_config",
    {
      title: "Get VM hardware config",
      description: "Return the full Proxmox VM configuration (cores, memory, disks, network, etc.).",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Host node name"),
          vmid: z.string().regex(/^\d+$/).describe("VM ID"),
          current: z
            .boolean()
            .optional()
            .describe("If true, fetch the *current* (running) config rather than pending"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid, current }) =>
      runTool(ctx, "get_vm_config", { node, vmid, current }, async () => {
        const params: Record<string, unknown> = {};
        if (current) params.current = 1;
        const data = await ctx.client.get(paths.qemuConfig(node, vmid), params);
        return jsonResult(`VM ${vmid} config:`, data);
      }),
  );

  server.registerTool(
    "get_vm_status",
    {
      title: "Get VM live status",
      description: "Return live status (cpu, mem, uptime, qmpstatus) of a VM.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid }) =>
      runTool(ctx, "get_vm_status", { node, vmid }, async () => {
        const data = await ctx.client.get(paths.qemuStatus(node, vmid, "current"));
        return jsonResult(`VM ${vmid} status:`, data);
      }),
  );

  // ---- Create / Clone ------------------------------------------------------

  server.registerTool(
    "create_vm",
    {
      title: "Create VM",
      description:
        "Create a new QEMU VM. Auto-detects default storage for the disk. Use clone_vm to duplicate from a template.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Host node name"),
          vmid: z.string().regex(/^\d+$/).describe("New VM ID (must be unique cluster-wide)"),
          name: z.string().min(1).max(255).describe("VM name"),
          cpus: z.number().int().min(1).max(32).default(1).describe("vCPU cores"),
          memory: z
            .number()
            .int()
            .min(512)
            .max(131072)
            .default(2048)
            .describe("Memory in MB (default 2048)"),
          disk_size: z
            .number()
            .int()
            .min(5)
            .max(1000)
            .default(10)
            .describe("Primary disk size in GB (default 10)"),
          storage: z.string().optional().describe("Storage pool for the primary disk"),
          ostype: z
            .string()
            .optional()
            .describe("OS type hint, e.g. 'l26' (Linux 2.6+), 'win11', 'other'"),
          network_bridge: z.string().default("vmbr0").describe("Network bridge (default vmbr0)"),
          iso: z.string().optional().describe("Optional ISO volume to attach (e.g. 'local:iso/ubuntu.iso')"),
          start_after_create: z.boolean().default(false).describe("Start VM after creation"),
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
      runTool(ctx, "create_vm", args as Record<string, unknown>, async () => {
        const targetStorage = args.storage ?? (await detectDefaultStorage(ctx, args.node));
        const body: Record<string, unknown> = {
          vmid: args.vmid,
          name: args.name,
          cores: args.cpus,
          memory: args.memory,
          scsihw: "virtio-scsi-single",
          ostype: args.ostype ?? "l26",
          net0: `${args.network_bridge},virtio=`,
          scsi0: `${targetStorage}:${args.disk_size}`,
          start: args.start_after_create ? 1 : 0,
        };
        if (args.iso) body.ide2 = `${args.iso},media=cdrom`;

        const upid = await ctx.client.post<string>(paths.qemu(args.node), body);
        const job = trackUpid(ctx, upid, { node: args.node, tool: "create_vm", args: args as Record<string, unknown> });
        return jsonResult(`VM ${args.vmid} creation started on ${args.node}.`, {
          job_id: job.job_id,
          upid,
        });
      }),
  );

  server.registerTool(
    "clone_vm",
    {
      title: "Clone VM",
      description: "Full or linked clone of an existing VM.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Source node"),
          source_vmid: z.string().regex(/^\d+$/).describe("Source VM ID"),
          target_vmid: z.string().regex(/^\d+$/).describe("New VM ID"),
          name: z.string().optional().describe("New VM name"),
          target_node: z.string().optional().describe("Destination node (default: same as source)"),
          full: z.boolean().default(true).describe("Full clone (true) or linked (false)"),
          storage: z.string().optional().describe("Target storage"),
          pool: z.string().optional().describe("Resource pool"),
          snapname: z.string().optional().describe("Source snapshot name to clone from"),
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
      runTool(ctx, "clone_vm", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {
          newid: args.target_vmid,
          full: args.full ? 1 : 0,
        };
        if (args.name) body.name = args.name;
        if (args.target_node) body.target = args.target_node;
        if (args.storage) body.storage = args.storage;
        if (args.pool) body.pool = args.pool;
        if (args.snapname) body.snapname = args.snapname;

        const upid = await ctx.client.post<string>(
          paths.qemuClone(args.node, args.source_vmid),
          body,
        );
        const job = trackUpid(ctx, upid, {
          node: args.target_node ?? args.node,
          tool: "clone_vm",
          args: args as Record<string, unknown>,
        });
        return jsonResult(`VM ${args.source_vmid} → ${args.target_vmid} clone started.`, {
          job_id: job.job_id,
          upid,
        });
      }),
  );

  // ---- Lifecycle -----------------------------------------------------------

  server.registerTool(
    "start_vm",
    {
      title: "Start VM",
      description: "Power on a QEMU VM.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid }) =>
      runTool(ctx, "start_vm", { node, vmid }, async () => {
        const upid = await ctx.client.post<string>(paths.qemuStatus(node, vmid, "start"));
        const job = trackUpid(ctx, upid, { node, tool: "start_vm", args: { node, vmid } });
        return jsonResult(`VM ${vmid} start requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "stop_vm",
    {
      title: "Stop VM (force)",
      description: "Hard stop (immediate power off) — equivalent to pulling the plug.",
      inputSchema: z
        .object({ node: z.string().min(1), vmid: z.string().regex(/^\d+$/) })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid }) =>
      runTool(ctx, "stop_vm", { node, vmid }, async () => {
        const upid = await ctx.client.post<string>(paths.qemuStatus(node, vmid, "stop"));
        const job = trackUpid(ctx, upid, { node, tool: "stop_vm", args: { node, vmid } });
        return jsonResult(`VM ${vmid} stop requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "shutdown_vm",
    {
      title: "Shutdown VM (graceful)",
      description: "ACPI shutdown. The guest OS must respond (install qemu-guest-agent for reliability).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          timeout: z.number().int().min(0).max(600).optional().describe("Max wait seconds (default 60)"),
          forceStop: z.boolean().optional().describe("Force stop after timeout"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, timeout, forceStop }) =>
      runTool(ctx, "shutdown_vm", { node, vmid, timeout, forceStop }, async () => {
        const body: Record<string, unknown> = {};
        if (timeout !== undefined) body.timeout = timeout;
        if (forceStop !== undefined) body.forceStop = forceStop ? 1 : 0;
        const upid = await ctx.client.post<string>(paths.qemuStatus(node, vmid, "shutdown"), body);
        const job = trackUpid(ctx, upid, { node, tool: "shutdown_vm", args: { node, vmid } });
        return jsonResult(`VM ${vmid} shutdown requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "reset_vm",
    {
      title: "Reset VM (hard)",
      description: "Hard reset — equivalent to pressing the reset button.",
      inputSchema: z
        .object({ node: z.string().min(1), vmid: z.string().regex(/^\d+$/) })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid }) =>
      runTool(ctx, "reset_vm", { node, vmid }, async () => {
        const upid = await ctx.client.post<string>(paths.qemuStatus(node, vmid, "reset"));
        const job = trackUpid(ctx, upid, { node, tool: "reset_vm", args: { node, vmid } });
        return jsonResult(`VM ${vmid} reset requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "reboot_vm",
    {
      title: "Reboot VM (graceful)",
      description: "ACPI reboot. Guest OS must respond.",
      inputSchema: z
        .object({ node: z.string().min(1), vmid: z.string().regex(/^\d+$/), timeout: z.number().int().min(0).max(600).optional() })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, timeout }) =>
      runTool(ctx, "reboot_vm", { node, vmid, timeout }, async () => {
        const body: Record<string, unknown> = {};
        if (timeout !== undefined) body.timeout = timeout;
        const upid = await ctx.client.post<string>(paths.qemuStatus(node, vmid, "reboot"), body);
        const job = trackUpid(ctx, upid, { node, tool: "reboot_vm", args: { node, vmid } });
        return jsonResult(`VM ${vmid} reboot requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "delete_vm",
    {
      title: "Delete VM",
      description:
        "Permanently delete a VM and its disks. DESTRUCTIVE — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          force: z.boolean().default(false).describe("Force-delete if running"),
          purge: z.boolean().default(false).describe("Purge from backup jobs"),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(ctx, "delete_vm", args as Record<string, unknown>, async () => {
        // If running and force=true, stop first
        try {
          const status = (await ctx.client.get(
            paths.qemuStatus(args.node, args.vmid, "current"),
          )) as { status?: string };
          if (status.status === "running" && args.force) {
            await ctx.client.post<string>(paths.qemuStatus(args.node, args.vmid, "stop"));
          }
        } catch {
          // ignore status check failure
        }

        const params: Record<string, unknown> = {};
        if (args.force) params.force = 1;
        if (args.purge) params.purge = 1;
        const upid = await ctx.client.delete<string>(paths.qemuVm(args.node, args.vmid), params);
        const job = trackUpid(ctx, upid, { node: args.node, tool: "delete_vm", args: args as Record<string, unknown> });
        return jsonResult(`VM ${args.vmid} deletion started.`, { job_id: job.job_id, upid });
      }),
  );
}

async function detectDefaultStorage(ctx: ToolContext, node: string): Promise<string> {
  const storage = (await ctx.client.get<Array<{ storage: string; content?: string }>>(
    paths.storage(),
  )) as Array<{ storage: string; content?: string }>;
  const nodeStorage = storage.find((s) => (s.content ?? "").includes("images"));
  if (nodeStorage) return nodeStorage.storage;
  // Fall back to first available
  if (storage[0]) return storage[0].storage;
  // Probe the node's storage list
  const nodeStorageList = (await ctx.client.get<Array<{ storage: string }>>(
    paths.nodeStorageStatus(node, ""),
  )) as Array<{ storage: string }>;
  if (nodeStorageList[0]) return nodeStorageList[0].storage;
  throw new Error(`No storage pool available on node ${node}`);
}