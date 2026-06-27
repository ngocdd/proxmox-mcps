/**
 * Node administration tools (Phase 2C).
 *
 * Covers apt/dns/hosts/time, network interfaces, services, disks,
 * subscription, certificates, and bulk startall/stopall/migrateall.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";
import { trackUpid } from "./helpers.js";

export function registerNodeAdminTools(server: McpServer, ctx: ToolContext): void {
  // ---- apt / repositories -------------------------------------------------

  server.registerTool(
    "node_apt_update",
    {
      title: "Update apt package lists",
      description: "Trigger `apt update` on the node to refresh package indexes.",
      inputSchema: z
        .object({ node: z.string().min(1), notify: z.boolean().optional().describe("Send notification on completion") })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ node, notify }) =>
      runTool(ctx, "node_apt_update", { node, notify }, async () => {
        const body: Record<string, unknown> = {};
        if (notify !== undefined) body.notify = notify ? 1 : 0;
        const upid = await ctx.client.post<string>(paths.nodeAptUpdate(node), body);
        const job = trackUpid(ctx, upid, { node, tool: "node_apt_update", args: { node } });
        return jsonResult(`apt update started on ${node}.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "node_apt_versions",
    {
      title: "List upgradable packages",
      description: "Return upgradable package versions on a node.",
      inputSchema: z
        .object({ node: z.string().min(1) })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node }) =>
      runTool(ctx, "node_apt_versions", { node }, async () => {
        const data = await ctx.client.get(paths.nodeAptVersions(node));
        return jsonResult(`Upgradable packages on ${node}:`, data);
      }),
  );

  server.registerTool(
    "node_apt_repos_list",
    {
      title: "List apt repositories",
      description: "Return the configured apt repositories on a node.",
      inputSchema: z
        .object({ node: z.string().min(1) })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node }) =>
      runTool(ctx, "node_apt_repos_list", { node }, async () => {
        const data = await ctx.client.get(paths.nodeAptRepos(node));
        return jsonResult(`APT repos on ${node}:`, data);
      }),
  );

  server.registerTool(
    "node_apt_repos_change",
    {
      title: "Change apt repositories",
      description: "Add, modify, or remove apt repository entries on a node. HIGH RISK.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          digest: z.string().optional(),
          handle: z.string().optional(),
          path: z.string().optional(),
          content: z.string().optional(),
          options: z.string().optional(),
          enabled: z.boolean().optional(),
          comment: z.string().optional(),
          index: z.number().int().optional(),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(ctx, "node_apt_repos_change", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "node" || k === "approval_token" || v === undefined) continue;
          body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.post(paths.nodeAptRepos(args.node as string), body);
        return jsonResult(`APT repos changed on ${args.node}.`, body);
      }),
  );

  // ---- DNS / hosts / time -------------------------------------------------

  server.registerTool(
    "get_node_dns",
    {
      title: "Get node DNS",
      description: "Return the node's DNS configuration.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "get_node_dns", { node }, async () => {
        const data = await ctx.client.get(paths.nodeDns(node));
        return jsonResult(`DNS on ${node}:`, data);
      }),
  );

  server.registerTool(
    "set_node_dns",
    {
      title: "Update node DNS",
      description: "Update the node's DNS configuration (search domain, nameservers).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          search: z.string().optional(),
          dns1: z.string().optional(),
          dns2: z.string().optional(),
          dns3: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "set_node_dns", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "node" || v === undefined) continue;
          body[k] = v;
        }
        await ctx.client.put(paths.nodeDns(args.node as string), body);
        return jsonResult(`DNS updated on ${args.node}.`, body);
      }),
  );

  server.registerTool(
    "get_node_hosts",
    {
      title: "Get node /etc/hosts",
      description: "Return the node's /etc/hosts entries.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "get_node_hosts", { node }, async () => {
        const data = await ctx.client.get(paths.nodeHosts(node));
        return jsonResult(`/etc/hosts on ${node}:`, data);
      }),
  );

  server.registerTool(
    "set_node_hosts",
    {
      title: "Write node /etc/hosts",
      description: "Write /etc/hosts entries on a node.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          data: z.string().min(1).describe("Full /etc/hosts contents"),
          digest: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, data, digest }) =>
      runTool(ctx, "set_node_hosts", { node }, async () => {
        const body: Record<string, unknown> = { data };
        if (digest) body.digest = digest;
        await ctx.client.post(paths.nodeHosts(node), body);
        return jsonResult(`/etc/hosts updated on ${node}.`, { node });
      }),
  );

  server.registerTool(
    "get_node_time",
    {
      title: "Get node time",
      description: "Return the node's system time, timezone, and local/UTC difference.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "get_node_time", { node }, async () => {
        const data = await ctx.client.get(paths.nodeTime(node));
        return jsonResult(`Time on ${node}:`, data);
      }),
  );

  server.registerTool(
    "set_node_time",
    {
      title: "Set node time",
      description: "Set the node's system time (ISO 8601 UTC timestamp).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          time: z.string().min(1).describe("ISO 8601 UTC timestamp"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, time }) =>
      runTool(ctx, "set_node_time", { node, time }, async () => {
        await ctx.client.put(paths.nodeTime(node), { time });
        return jsonResult(`Time set on ${node}.`, { node, time });
      }),
  );

  server.registerTool(
    "get_node_timezone",
    {
      title: "Get node timezone",
      description: "Return the node's timezone.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "get_node_timezone", { node }, async () => {
        const data = await ctx.client.get(paths.nodeTimezone(node));
        return jsonResult(`Timezone on ${node}:`, data);
      }),
  );

  server.registerTool(
    "set_node_timezone",
    {
      title: "Set node timezone",
      description: "Set the node's timezone (e.g. 'Europe/Helsinki', 'UTC').",
      inputSchema: z
        .object({
          node: z.string().min(1),
          timezone: z.string().min(1),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, timezone }) =>
      runTool(ctx, "set_node_timezone", { node, timezone }, async () => {
        await ctx.client.put(paths.nodeTimezone(node), { timezone });
        return jsonResult(`Timezone set on ${node}.`, { node, timezone });
      }),
  );

  // ---- Config / report ---------------------------------------------------

  server.registerTool(
    "get_node_config",
    {
      title: "Get node config",
      description: "Return the node's Proxmox configuration (description, ACPI wake-on-lan, etc.).",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "get_node_config", { node }, async () => {
        const data = await ctx.client.get(paths.nodeConfig(node));
        return jsonResult(`Config for ${node}:`, data);
      }),
  );

  server.registerTool(
    "update_node_config",
    {
      title: "Update node config",
      description: "Update node description, ACPI settings, wake-on-lan, etc. HIGH RISK.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          description: z.string().optional(),
          acpi: z.boolean().optional(),
          startall_onboot_delay: z.number().int().optional(),
          wakeonlan: z.boolean().optional(),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "update_node_config", args as Record<string, unknown>, async () => {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
          if (k === "node" || k === "approval_token" || v === undefined) continue;
          body[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
        }
        await ctx.client.put(paths.nodeConfig(args.node as string), body);
        return jsonResult(`Config updated for ${args.node}.`, body);
      }),
  );

  server.registerTool(
    "get_node_report",
    {
      title: "Get node diagnostic report",
      description: "Return a Proxmox pvereport-style diagnostic bundle as text.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "get_node_report", { node }, async () => {
        const data = await ctx.client.get(paths.nodeReport(node));
        return jsonResult(`Diagnostic report for ${node}:`, data);
      }),
  );

  // ---- Bulk startall / stopall / migrateall ------------------------------

  server.registerTool(
    "node_start_all",
    {
      title: "Start all VMs/CTs on node",
      description: "Bulk-start all VMs and containers on a node.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          force: z.boolean().optional(),
          vms: z.string().optional().describe("Comma-separated list of VMIDs to start"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, force, vms }) =>
      runTool(ctx, "node_start_all", { node, force, vms }, async () => {
        const body: Record<string, unknown> = {};
        if (force !== undefined) body.force = force ? 1 : 0;
        if (vms) body.vms = vms;
        const upid = await ctx.client.post<string>(paths.nodeStartAll(node), body);
        const job = trackUpid(ctx, upid, { node, tool: "node_start_all", args: { node } });
        return jsonResult(`Bulk start-all started on ${node}.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "node_stop_all",
    {
      title: "Stop all VMs/CTs on node",
      description: "Bulk-stop all running VMs and containers on a node.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          force: z.boolean().optional(),
          vms: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, force, vms }) =>
      runTool(ctx, "node_stop_all", { node, force, vms }, async () => {
        const body: Record<string, unknown> = {};
        if (force !== undefined) body.force = force ? 1 : 0;
        if (vms) body.vms = vms;
        const upid = await ctx.client.post<string>(paths.nodeStopAll(node), body);
        const job = trackUpid(ctx, upid, { node, tool: "node_stop_all", args: { node } });
        return jsonResult(`Bulk stop-all started on ${node}.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "node_migrate_all",
    {
      title: "Migrate all VMs/CTs off node",
      description: "Bulk-migrate all VMs/containers off this node to others (live).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          target: z.string().optional().describe("Specific target node (else auto-distribute)"),
          max_workers: z.number().int().min(1).max(64).optional(),
          with_local_disks: z.boolean().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, target, max_workers, with_local_disks }) =>
      runTool(ctx, "node_migrate_all", { node, target, max_workers, with_local_disks }, async () => {
        const body: Record<string, unknown> = {};
        if (target) body.target = target;
        if (max_workers !== undefined) body.max_workers = max_workers;
        if (with_local_disks !== undefined) body["with-local-disks"] = with_local_disks ? 1 : 0;
        const upid = await ctx.client.post<string>(paths.nodeMigrateAll(node), body);
        const job = trackUpid(ctx, upid, { node, tool: "node_migrate_all", args: { node, target } });
        return jsonResult(`Bulk migrate-all started on ${node}.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "node_wake_on_lan",
    {
      title: "Send Wake-on-LAN",
      description: "Send a Wake-on-LAN magic packet to another host (must be configured).",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ node }) =>
      runTool(ctx, "node_wake_on_lan", { node }, async () => {
        await ctx.client.post(paths.nodeWakeOnLan(node));
        return jsonResult(`Wake-on-LAN sent via ${node}.`, { node });
      }),
  );

  // ---- Subscription ------------------------------------------------------

  server.registerTool(
    "get_node_subscription",
    {
      title: "Get node subscription",
      description: "Return the Proxmox subscription state for a node.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "get_node_subscription", { node }, async () => {
        const data = await ctx.client.get(paths.nodeSubscription(node));
        return jsonResult(`Subscription on ${node}:`, data);
      }),
  );

  server.registerTool(
    "set_node_subscription",
    {
      title: "Set subscription key",
      description: "Set the Proxmox subscription key on a node. HIGH RISK.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          key: z.string().min(1).describe("Subscription key"),
          approval_token: z.string().optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx, "set_node_subscription", args as Record<string, unknown>, async () => {
        await ctx.client.post(paths.nodeSubscription(args.node as string), { key: args.key });
        return jsonResult(`Subscription key set on ${args.node}.`, { node: args.node });
      }),
  );

  server.registerTool(
    "update_node_subscription",
    {
      title: "Update subscription",
      description: "Trigger a subscription status refresh on a node.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ node }) =>
      runTool(ctx, "update_node_subscription", { node }, async () => {
        await ctx.client.put(paths.nodeSubscription(node), { force: 1 });
        return jsonResult(`Subscription refreshed on ${node}.`, { node });
      }),
  );

  server.registerTool(
    "delete_node_subscription",
    {
      title: "Delete subscription",
      description: "Remove the Proxmox subscription from a node.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ node }) =>
      runTool(ctx, "delete_node_subscription", { node }, async () => {
        await ctx.client.delete(paths.nodeSubscription(node));
        return jsonResult(`Subscription removed from ${node}.`, { node });
      }),
  );
}