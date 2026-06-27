/**
 * Container (LXC) CRUD + lifecycle tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";
import { trackUpid } from "../helpers.js";

export function registerContainerCrudTools(server: McpServer, ctx: ToolContext): void {
  // ---- Read ----------------------------------------------------------------

  server.registerTool(
    "get_containers",
    {
      title: "List containers (cluster-wide)",
      description: "List all LXC containers across the cluster with status and resource usage.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "get_containers", {}, async () => {
        const data = await ctx.client.get(paths.clusterResources("vm"));
        const lxc = (data as Array<Record<string, unknown>>).filter(
          (r) => String(r.type) === "lxc",
        );
        return jsonResult(`Containers (${lxc.length}):`, lxc);
      }),
  );

  server.registerTool(
    "get_container_config",
    {
      title: "Get container config",
      description: "Return the full Proxmox container configuration.",
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
      runTool(ctx, "get_container_config", { node, vmid }, async () => {
        const data = await ctx.client.get(paths.lxcConfig(node, vmid));
        return jsonResult(`Container ${vmid} config:`, data);
      }),
  );

  server.registerTool(
    "get_container_status",
    {
      title: "Get container live status",
      description: "Return live status (cpu, mem, uptime) of a container.",
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
      runTool(ctx, "get_container_status", { node, vmid }, async () => {
        const data = await ctx.client.get(paths.lxcStatus(node, vmid, "current"));
        return jsonResult(`Container ${vmid} status:`, data);
      }),
  );

  server.registerTool(
    "get_container_ip",
    {
      title: "Get container IPs",
      description:
        "Return the container's network interfaces with their IPv4/IPv6 addresses (DHCP-aware — no static IP needed).",
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
      runTool(ctx, "get_container_ip", { node, vmid }, async () => {
        const interfaces = (await ctx.client.get<unknown[]>(
          paths.lxcInterfaces(node, vmid),
        )) as Array<{
          name: string;
          ip_addresses?: Array<{ ip_address: string; prefix: number; family: string }>;
        }>;
        const summary = interfaces.map((i) => ({
          interface: i.name,
          addresses: (i.ip_addresses ?? []).map((a) => `${a.ip_address}/${a.prefix}`),
        }));
        return jsonResult(`Container ${vmid} interfaces:`, summary);
      }),
  );

  // ---- Create / Clone ------------------------------------------------------

  server.registerTool(
    "create_container",
    {
      title: "Create container",
      description: "Create a new LXC container from a vztmpl template.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Host node name"),
          vmid: z.string().regex(/^\d+$/).describe("New container ID"),
          ostemplate: z
            .string()
            .min(1)
            .describe("OS template volume ID (e.g. 'local:vztmpl/alpine-3.19-default_...tar.xz')"),
          hostname: z.string().optional().describe("Container hostname"),
          cores: z.number().int().min(1).max(32).default(1).describe("vCPU cores"),
          memory: z.number().int().min(16).max(131072).default(512).describe("Memory in MiB"),
          swap: z.number().int().min(0).max(131072).default(512).describe("Swap in MiB"),
          disk_size: z.number().int().min(1).max(1000).default(8).describe("Root disk in GB"),
          storage: z.string().optional().describe("Storage pool for rootfs"),
          password: z.string().optional().describe("Root password (will be redacted in logs)"),
          ssh_public_keys: z.string().optional().describe("URL-encoded SSH public keys for root"),
          network_bridge: z.string().default("vmbr0").describe("Network bridge"),
          start_after_create: z.boolean().default(false),
          onboot: z.boolean().default(false),
          nesting: z.boolean().default(false).describe("Enable LXC nesting"),
          unprivileged: z.boolean().default(true).describe("Create as unprivileged container"),
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
      runTool(ctx, "create_container", args as Record<string, unknown>, async () => {
        const targetStorage = args.storage ?? (await detectRootfsStorage(ctx, args.node));
        const body: Record<string, unknown> = {
          vmid: args.vmid,
          ostemplate: args.ostemplate,
          cores: args.cores,
          memory: args.memory,
          swap: args.swap,
          rootfs: `${targetStorage}:${args.disk_size}`,
          net0: `name=eth0,bridge=${args.network_bridge},ip=dhcp`,
          start: args.start_after_create ? 1 : 0,
          onboot: args.onboot ? 1 : 0,
          features: args.nesting ? "nesting=1" : "",
          unprivileged: args.unprivileged ? 1 : 0,
        };
        if (args.hostname) body.hostname = args.hostname;
        if (args.password) body.password = args.password;
        if (args.ssh_public_keys) body["ssh-public-keys"] = args.ssh_public_keys;

        const upid = await ctx.client.post<string>(paths.lxc(args.node), body);
        const job = trackUpid(ctx, upid, {
          node: args.node,
          tool: "create_container",
          args: args as Record<string, unknown>,
        });
        return jsonResult(`Container ${args.vmid} creation started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "clone_container",
    {
      title: "Clone container",
      description: "Clone an existing container to a new ID on the same or different node.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          source_vmid: z.string().regex(/^\d+$/),
          target_vmid: z.string().regex(/^\d+$/),
          hostname: z.string().optional(),
          target_node: z.string().optional(),
          full: z.boolean().default(true),
          storage: z.string().optional(),
          pool: z.string().optional(),
          snapname: z.string().optional(),
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
      runTool(ctx, "clone_container", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {
          newid: args.target_vmid,
          full: args.full ? 1 : 0,
        };
        if (args.hostname) body.hostname = args.hostname;
        if (args.target_node) body.target = args.target_node;
        if (args.storage) body.storage = args.storage;
        if (args.pool) body.pool = args.pool;
        if (args.snapname) body.snapname = args.snapname;

        const upid = await ctx.client.post<string>(
          paths.lxcClone(args.node, args.source_vmid),
          body,
        );
        const job = trackUpid(ctx, upid, {
          node: args.target_node ?? args.node,
          tool: "clone_container",
          args: args as Record<string, unknown>,
        });
        return jsonResult(`Container clone started.`, { job_id: job.job_id, upid });
      }),
  );

  // ---- Lifecycle -----------------------------------------------------------

  server.registerTool(
    "start_container",
    {
      title: "Start container",
      description: "Start an LXC container.",
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
      runTool(ctx, "start_container", { node, vmid }, async () => {
        const upid = await ctx.client.post<string>(paths.lxcStatus(node, vmid, "start"));
        const job = trackUpid(ctx, upid, { node, tool: "start_container", args: { node, vmid } });
        return jsonResult(`Container ${vmid} start requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "stop_container",
    {
      title: "Stop container (force)",
      description: "Hard-stop (immediate power off) the container.",
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
      runTool(ctx, "stop_container", { node, vmid }, async () => {
        const upid = await ctx.client.post<string>(paths.lxcStatus(node, vmid, "stop"));
        const job = trackUpid(ctx, upid, { node, tool: "stop_container", args: { node, vmid } });
        return jsonResult(`Container ${vmid} stop requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "shutdown_container",
    {
      title: "Shutdown container (graceful)",
      description: "Graceful shutdown via `pct shutdown`. Equivalent to ACPI shutdown.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          timeout: z.number().int().min(0).max(600).optional(),
          forceStop: z.boolean().optional(),
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
      runTool(ctx, "shutdown_container", { node, vmid, timeout, forceStop }, async () => {
        const body: Record<string, unknown> = {};
        if (timeout !== undefined) body.timeout = timeout;
        if (forceStop !== undefined) body.forceStop = forceStop ? 1 : 0;
        const upid = await ctx.client.post<string>(paths.lxcStatus(node, vmid, "shutdown"), body);
        const job = trackUpid(ctx, upid, { node, tool: "shutdown_container", args: { node, vmid } });
        return jsonResult(`Container ${vmid} shutdown requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "restart_container",
    {
      title: "Restart container",
      description: "Reboot an LXC container.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          timeout: z.number().int().min(0).max(600).optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, timeout }) =>
      runTool(ctx, "restart_container", { node, vmid, timeout }, async () => {
        const body: Record<string, unknown> = {};
        if (timeout !== undefined) body.timeout = timeout;
        const upid = await ctx.client.post<string>(paths.lxcStatus(node, vmid, "reboot"), body);
        const job = trackUpid(ctx, upid, { node, tool: "restart_container", args: { node, vmid } });
        return jsonResult(`Container ${vmid} restart requested.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "delete_container",
    {
      title: "Delete container",
      description:
        "Permanently delete a container and its data. DESTRUCTIVE. Requires approval_token or dangerously_allow_destructive.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          force: z.boolean().default(false).describe("Force deletion even if running"),
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
    async (args) =>
      runTool(ctx, "delete_container", args as Record<string, unknown>, async () => {
        // If running and force=true, stop first
        try {
          const status = (await ctx.client.get(
            paths.lxcStatus(args.node, args.vmid, "current"),
          )) as { status?: string };
          if (status.status === "running" && args.force) {
            await ctx.client.post<string>(paths.lxcStatus(args.node, args.vmid, "stop"));
          }
        } catch {
          // ignore
        }

        const params: Record<string, unknown> = {};
        if (args.force) params.force = 1;
        const upid = await ctx.client.delete<string>(paths.lxcCt(args.node, args.vmid), params);
        const job = trackUpid(ctx, upid, {
          node: args.node,
          tool: "delete_container",
          args: args as Record<string, unknown>,
        });
        return jsonResult(`Container ${args.vmid} deletion started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "update_container_resources",
    {
      title: "Update container CPU/memory/swap",
      description: "Convenience wrapper around update_container_config that resizes CPU, memory, swap, and disk in one call.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          cores: z.number().int().min(1).max(32).optional(),
          memory: z.number().int().min(16).max(131072).optional().describe("Memory in MiB"),
          swap: z.number().int().min(0).max(131072).optional().describe("Swap in MiB"),
          disk_size_gb: z.number().int().min(1).max(1000).optional().describe("New rootfs size in GB"),
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
      runTool(
        ctx,
        "update_container_resources",
        args as Record<string, unknown>,
        async () => {
          const body: Record<string, unknown> = {};
          if (args.cores !== undefined) body.cores = args.cores;
          if (args.memory !== undefined) body.memory = args.memory;
          if (args.swap !== undefined) body.swap = args.swap;

          if (Object.keys(body).length > 0) {
            await ctx.client.put(paths.lxcConfig(args.node, args.vmid), body);
          }
          if (args.disk_size_gb !== undefined) {
            await ctx.client.put(paths.lxcResize(args.node, args.vmid, "rootfs"), {
              size: `${args.disk_size_gb}G`,
            });
          }
          return jsonResult(`Container ${args.vmid} resources updated.`, args as Record<string, unknown>);
        },
      ),
  );
}

async function detectRootfsStorage(ctx: ToolContext, node: string): Promise<string> {
  const storage = (await ctx.client.get<Array<{ storage: string; content?: string }>>(
    paths.storage(),
  )) as Array<{ storage: string; content?: string }>;
  const fsStorage = storage.find((s) => (s.content ?? "").includes("rootdir"));
  if (fsStorage) return fsStorage.storage;
  if (storage[0]) return storage[0].storage;
  throw new Error(`No storage pool available on node ${node}`);
}