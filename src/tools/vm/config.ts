/**
 * VM Config & cloud-init tools.
 *
 * PUT /nodes/{node}/qemu/{vmid}/config — patch any single config key.
 * Resize, regenerate MAC/UUID, set cloud-init drive, view pending changes.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult, ok } from "../../format/response.js";
import { trackUpid } from "../helpers.js";

/**
 * Allowlist of VM config keys that may be modified via `update_vm_config`.
 * Dangerous keys (`args`, `hostpci*`, `usb*`, `machine`, `smbios1`, `numa*`,
 * `bios`, `boot`, `cpuflags`, …) are NOT included — they can attach raw
 * host devices, override SMBIOS, change QEMU machine type, or smuggle
 * attacker-controlled QEMU command-line args. Callers that need them must
 * use the Proxmox UI/API directly.
 *
 * Disk and NIC slots (scsi0..N, virtio0..N, sata0..N, ide0..N, net0..N)
 * are allowed via `DISK_NIC_PATTERN`.
 */
export const VM_CONFIG_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  // CPU / memory
  "cores",
  "memory",
  "balloon",
  "vcpus",
  "cpulimit",
  "cpuunits",
  // Boot & runtime
  "ostype",
  "name",
  "description",
  "onboot",
  "startup",
  "protection",
  "agent",
  "keyboard",
  "hotplug",
  "freeze",
  "tags",
]);

export const DISK_NIC_PATTERN = /^(scsi|virtio|sata|ide|net)\d+$/;

/**
 * Validate that every key in the user-supplied config dict is allowed.
 * Returns the list of rejected keys (empty if all good).
 */
export function findDisallowedConfigKeys(
  config: Record<string, unknown>,
): string[] {
  const rejected: string[] = [];
  for (const key of Object.keys(config)) {
    if (VM_CONFIG_ALLOWED_KEYS.has(key)) continue;
    if (DISK_NIC_PATTERN.test(key)) continue;
    rejected.push(key);
  }
  return rejected;
}

export function registerVmConfigTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "update_vm_config",
    {
      title: "Update VM config",
      description:
        "Patch one or more VM configuration keys (cores, memory, scsi0 size, net0, ostype, etc.). Use current=true to update a running VM where supported. Only a safe allowlist of keys is accepted — keys that can attach host PCI/USB devices, override SMBIOS, or change the QEMU machine type are rejected. HIGH RISK — ask the user to confirm before invoking. Modifying the `protection` (delete-protection) key is treated as destructive — a confirmation prompt is required, like for `delete_vm`.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          current: z.boolean().optional().describe("Apply to running VM where supported"),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this action"),
          // Record of config keys; validation of each key happens in the handler.
          config: z
            .record(z.union([z.string(), z.number(), z.boolean()]))
            .describe("Config keys to update, e.g. {\"cores\":4,\"memory\":4096}"),
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
      runTool(ctx, "update_vm_config", args as Record<string, unknown>, async () => {
        const config = (args.config ?? {}) as Record<string, unknown>;
        const rejected = findDisallowedConfigKeys(config);
        if (rejected.length > 0) {
          throw new Error(
            `update_vm_config rejected ${rejected.length} disallowed key(s): ${rejected.join(", ")}. ` +
              `Dangerous keys (args, hostpci*, usb*, machine, smbios1, numa*, bios, boot, cpuflags, …) ` +
              `are not exposed via this tool — modify them through the Proxmox API/UI directly.`,
          );
        }
        // Modifying the `protection` (delete-protection) flag is treated as a
        // destructive change — matching the gravity of `delete_vm`. Demand a
        // confirmation prompt unless the caller has already opted in with
        // `confirm: true`.
        const protectedCheck = ctx.policy.assertProtectedKeyChange(
          "update_vm_config",
          args as Record<string, unknown>,
          config,
        );
        if (!protectedCheck.allowed) {
          return ok(protectedCheck.prompt);
        }
        if (Object.keys(config).length === 0) {
          return jsonResult(`No changes.`, { node: args.node, vmid: args.vmid });
        }
        const upid = await ctx.client.post<string>(
          paths.qemuConfig(args.node, args.vmid),
          config,
        );
        const job = trackUpid(ctx, upid, {
          node: args.node,
          tool: "update_vm_config",
          args: { node: args.node, vmid: args.vmid, keys: Object.keys(config) },
        });
        return jsonResult(`VM ${args.vmid} config update started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "resize_vm_disk",
    {
      title: "Resize VM disk",
      description:
        "Resize a VM disk (e.g. scsi0, virtio0). Use a '+N' suffix on size to grow, or absolute size like '50G'.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          disk: z.string().min(1).describe("Disk identifier (e.g. scsi0, virtio0)"),
          size: z.string().min(1).describe("New size (e.g. '50G', '+20G')"),
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
      runTool(ctx, "resize_vm_disk", { node, vmid, disk, size }, async () => {
        const upid = await ctx.client.put<string>(
          paths.qemuResize(node, vmid, disk),
          { size },
        );
        const job = trackUpid(ctx, upid, {
          node,
          tool: "resize_vm_disk",
          args: { node, vmid, disk, size },
        });
        return jsonResult(`VM ${vmid} disk ${disk} resize started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "regenerate_vm_config",
    {
      title: "Regenerate VM identity",
      description:
        "Regenerate the VM's MAC addresses and (optionally) SMBIOS UUID. Useful after cloning.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          force: z.boolean().optional().describe("Regenerate even if VM has a custom MAC"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, force }) =>
      runTool(ctx, "regenerate_vm_config", { node, vmid, force }, async () => {
        const upid = await ctx.client.post<string>(paths.qemuVm(node, vmid), {
          regenerate: 1,
          ...(force ? { force: 1 } : {}),
        });
        const job = trackUpid(ctx, upid, {
          node,
          tool: "regenerate_vm_config",
          args: { node, vmid, force },
        });
        return jsonResult(`VM ${vmid} identity regeneration started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "set_vm_cloudinit",
    {
      title: "Update cloud-init drive",
      description:
        "Set cloud-init parameters (user, password, SSH keys, IP config, DNS, search domain) and regenerate the cloud-init ISO.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          ciuser: z.string().optional().describe("Cloud-init user"),
          cipassword: z.string().optional().describe("Cloud-init password (redacted in logs)"),
          sshkeys: z.string().optional().describe("URL-encoded SSH public keys"),
          ipconfig0: z.string().optional().describe("e.g. 'ip=dhcp' or 'ip=10.0.0.10/24,gw=10.0.0.1'"),
          nameserver: z.string().optional().describe("DNS servers"),
          searchdomain: z.string().optional().describe("DNS search domain"),
          regenerate: z.boolean().default(true).describe("Regenerate cloud-init ISO after update"),
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
      runTool(ctx, "set_vm_cloudinit", args as Record<string, unknown>, async () => {
        // Update each non-empty param via PUT /config
        const cfgBody: Record<string, unknown> = {};
        if (args.ciuser !== undefined) cfgBody.ciuser = args.ciuser;
        if (args.cipassword !== undefined) cfgBody.cipassword = args.cipassword;
        if (args.sshkeys !== undefined) cfgBody.sshkeys = args.sshkeys;
        if (args.ipconfig0 !== undefined) cfgBody.ipconfig0 = args.ipconfig0;
        if (args.nameserver !== undefined) cfgBody.nameserver = args.nameserver;
        if (args.searchdomain !== undefined) cfgBody.searchdomain = args.searchdomain;

        if (Object.keys(cfgBody).length > 0) {
          await ctx.client.post(paths.qemuConfig(args.node, args.vmid), cfgBody);
        }

        let upid: string | undefined;
        let jobId: string | undefined;
        if (args.regenerate) {
          upid = await ctx.client.post<string>(paths.qemuCloudinit(args.node, args.vmid));
          const job = trackUpid(ctx, upid, {
            node: args.node,
            tool: "set_vm_cloudinit",
            args: { node: args.node, vmid: args.vmid, regenerate: true },
          });
          jobId = job.job_id;
        }
        return jsonResult(`Cloud-init updated for VM ${args.vmid}.`, { job_id: jobId, upid });
      }),
  );

  server.registerTool(
    "get_vm_pending",
    {
      title: "Get pending VM config",
      description:
        "Return pending config values not yet applied (only present when running config has pending changes).",
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
      runTool(ctx, "get_vm_pending", { node, vmid }, async () => {
        const data = await ctx.client.get(paths.qemuPending(node, vmid));
        return jsonResult(`Pending config for VM ${vmid}:`, data);
      }),
  );
}