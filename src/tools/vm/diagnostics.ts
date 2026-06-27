/**
 * VM Diagnostics & AI debug tools.
 *
 * Covers RRD metrics, QEMU guest agent introspection, sendkey, monitor,
 * and firewall rules/options.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";
import { trackUpid } from "../helpers.js";

const TimeframeSchema = z.enum(["hour", "day", "week", "month", "year"]);
const CfSchema = z.enum(["AVERAGE", "MAX", "MIN"]).default("AVERAGE");

export function registerVmDiagnosticsTools(server: McpServer, ctx: ToolContext): void {
  // ---- RRD metrics ---------------------------------------------------------

  server.registerTool(
    "get_vm_rrd",
    {
      title: "Get VM RRD time series",
      description:
        "Return raw RRD metrics (cpu, mem, netin/out, diskread/write) for a VM at a given timeframe. Used for charting and capacity analysis.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          timeframe: TimeframeSchema,
          cf: CfSchema,
          ds: z.string().optional().describe("Filter to a specific data source (e.g. 'cpu', 'memused')"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid, timeframe, cf, ds }) =>
      runTool(ctx, "get_vm_rrd", { node, vmid, timeframe, cf, ds }, async () => {
        const params: Record<string, unknown> = { cf };
        if (ds) params.ds = ds;
        const data = await ctx.client.get(paths.qemuRrd(node, vmid, timeframe), params);
        return jsonResult(`RRD for VM ${vmid} (${timeframe}, ${cf}):`, data);
      }),
  );

  server.registerTool(
    "get_vm_rrddata",
    {
      title: "Get VM recent RRD samples",
      description:
        "Return recent RRD samples for a VM. Cheaper than get_vm_rrd for ad-hoc checks.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          timeframe: TimeframeSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid, timeframe }) =>
      runTool(ctx, "get_vm_rrddata", { node, vmid, timeframe }, async () => {
        const data = await ctx.client.get(paths.qemuRrdData(node, vmid, timeframe));
        return jsonResult(`Recent RRD samples for VM ${vmid}:`, data);
      }),
  );

  // ---- QEMU guest agent ----------------------------------------------------

  const guestAgentRead = (
    name: string,
    action: Parameters<typeof paths.qemuAgent>[2],
    desc: string,
  ): void => {
    server.registerTool(
      name,
      {
        title: name.replace(/_/g, " "),
        description: desc,
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
        runTool(ctx, name, { node, vmid }, async () => {
          const data = await ctx.client.get(paths.qemuAgent(node, vmid, action));
          return jsonResult(`${name} for VM ${vmid}:`, data);
        }),
    );
  };

  guestAgentRead(
    "vm_agent_info",
    "info",
    "Return QEMU guest agent metadata.",
  );
  guestAgentRead(
    "vm_agent_get_hostname",
    "get-host-name",
    "Return the guest VM hostname.",
  );
  guestAgentRead(
    "vm_agent_get_osinfo",
    "get-osinfo",
    "Return guest OS info (kernel, name, version, pretty name).",
  );
  guestAgentRead(
    "vm_agent_get_users",
    "get-users",
    "Return logged-in users inside the guest.",
  );
  guestAgentRead(
    "vm_agent_get_network_interfaces",
    "network-get-interfaces",
    "Return network interfaces from inside the guest (with IPs).",
  );
  guestAgentRead(
    "vm_agent_get_vcpus",
    "get-vcpus",
    "Return vCPU topology and current usage from inside the guest.",
  );
  guestAgentRead(
    "vm_agent_get_time",
    "get-time",
    "Return guest clock time and skew vs host.",
  );
  guestAgentRead(
    "vm_agent_get_fsinfo",
    "get-fsinfo",
    "Return guest filesystem info (mountpoints, used/free bytes).",
  );

  server.registerTool(
    "vm_agent_fstrim",
    {
      title: "Trim guest filesystem",
      description:
        "Issue fstrim to the guest VM, returning free blocks to the hypervisor (reduces provisioned storage).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ node, vmid }) =>
      runTool(ctx, "vm_agent_fstrim", { node, vmid }, async () => {
        const upid = await ctx.client.post<string>(paths.qemuAgent(node, vmid, "fstrim"));
        const job = trackUpid(ctx, upid, { node, tool: "vm_agent_fstrim", args: { node, vmid } });
        return jsonResult(`fstrim started on VM ${vmid}.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "vm_agent_exec",
    {
      title: "Execute command in guest (QEMU agent)",
      description:
        "Run a shell command inside a VM via the QEMU guest agent. Returns a pid; poll exec_status for output.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          command: z.string().min(1).describe("Shell command to run inside the guest"),
          input_data: z.string().optional().describe("Optional stdin"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, command, input_data }) =>
      runTool(ctx, "vm_agent_exec", { node, vmid, command }, async () => {
        const body: Record<string, unknown> = { command };
        if (input_data) body.input_data = input_data;
        const data = (await ctx.client.post(paths.qemuAgentExec(node, vmid), body)) as { pid: number };
        return jsonResult(`Exec started on VM ${vmid}.`, { pid: data.pid });
      }),
  );

  server.registerTool(
    "vm_agent_exec_status",
    {
      title: "Poll QEMU guest exec status",
      description: "Return exit status + captured stdout/stderr for a previously launched exec.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          pid: z.union([z.string(), z.number()]).describe("PID returned by vm_agent_exec"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, vmid, pid }) =>
      runTool(ctx, "vm_agent_exec_status", { node, vmid, pid }, async () => {
        const data = await ctx.client.get(paths.qemuAgentExecStatus(node, vmid, pid));
        return jsonResult(`Exec ${pid} status:`, data);
      }),
  );

  server.registerTool(
    "vm_agent_set_user_password",
    {
      title: "Set guest user password",
      description:
        "Set a user password inside the guest via QEMU agent. HIGH RISK — requires approval_token.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          username: z.string().min(1),
          password: z.string().min(1).describe("New password (redacted in logs)"),
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
    async (args) =>
      runTool(ctx, "vm_agent_set_user_password", args as Record<string, unknown>, async () => {
        const upid = await ctx.client.post<string>(
          paths.qemuAgent(args.node, args.vmid, "set-user-password"),
          { username: args.username, password: args.password },
        );
        const job = trackUpid(ctx, upid, {
          node: args.node,
          tool: "vm_agent_set_user_password",
          args: { node: args.node, vmid: args.vmid, username: args.username },
        });
        return jsonResult(`Password set on VM ${args.vmid}.`, { job_id: job.job_id, upid });
      }),
  );

  // ---- sendkey / monitor ---------------------------------------------------

  server.registerTool(
    "vm_sendkey",
    {
      title: "Send key to QEMU VM",
      description:
        "Send a key combination to a QEMU VM (useful for unlocking screens, sending Ctrl+Alt+Del, etc.).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          key: z.string().min(1).describe("Key name, e.g. 'ctrl-alt-delete', 'ret', 'a'"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, key }) =>
      runTool(ctx, "vm_sendkey", { node, vmid, key }, async () => {
        await ctx.client.post(paths.qemuSendkey(node, vmid), { key });
        return jsonResult(`Key sent to VM ${vmid}.`, { key });
      }),
  );

  server.registerTool(
    "vm_monitor",
    {
      title: "QEMU monitor command",
      description:
        "Run an arbitrary QEMU monitor command. Examples: 'info status', 'dump-guest-memory', 'screendump /tmp/screen.ppm'. MEDIUM RISK.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          command: z.string().min(1).describe("QEMU monitor command"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, command }) =>
      runTool(ctx, "vm_monitor", { node, vmid, command }, async () => {
        const data = await ctx.client.post(paths.qemuMonitor(node, vmid), { command });
        return jsonResult(`Monitor response:`, data);
      }),
  );

  // ---- firewall -----------------------------------------------------------

  server.registerTool(
    "vm_firewall_rules",
    {
      title: "Get VM firewall rules",
      description: "Return the firewall rules for a VM's network interface.",
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
      runTool(ctx, "vm_firewall_rules", { node, vmid }, async () => {
        const data = await ctx.client.get(paths.qemuFirewallRules(node, vmid));
        return jsonResult(`Firewall rules for VM ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "vm_firewall_options",
    {
      title: "Get VM firewall options",
      description: "Return VM-level firewall options (enable, dhcp, macfilter, etc.).",
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
      runTool(ctx, "vm_firewall_options", { node, vmid }, async () => {
        const data = await ctx.client.get(paths.qemuFirewallOptions(node, vmid));
        return jsonResult(`Firewall options for VM ${vmid}:`, data);
      }),
  );
}