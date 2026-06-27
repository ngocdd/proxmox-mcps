/**
 * VM Console & remote access tools.
 *
 * Returns VNC/SPICE/terminal tickets that a frontend can use to open a console.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";

export function registerVmConsoleTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "vm_vncproxy",
    {
      title: "Get VM VNC proxy ticket",
      description:
        "Generate a VNC ticket and port to open a remote console to the VM. Returns a one-time ticket for noVNC clients.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          websocket: z.boolean().optional().describe("Generate a WebSocket ticket (default true)"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, websocket }) =>
      runTool(ctx, "vm_vncproxy", { node, vmid, websocket }, async () => {
        const body: Record<string, unknown> = { websocket: websocket === false ? 0 : 1 };
        const data = await ctx.client.post(paths.qemuVncProxy(node, vmid), body);
        return jsonResult(`VNC ticket for VM ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "vm_termproxy",
    {
      title: "Get VM terminal proxy ticket",
      description: "Generate a serial terminal (termproxy) ticket for the VM.",
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
      runTool(ctx, "vm_termproxy", { node, vmid }, async () => {
        const data = await ctx.client.post(paths.qemuTermProxy(node, vmid));
        return jsonResult(`Terminal ticket for VM ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "vm_spiceproxy",
    {
      title: "Get VM SPICE proxy ticket",
      description: "Generate a SPICE ticket for high-fidelity VM console access.",
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
      runTool(ctx, "vm_spiceproxy", { node, vmid }, async () => {
        const data = await ctx.client.post(paths.qemuSpiceProxy(node, vmid));
        return jsonResult(`SPICE ticket for VM ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "vm_mtunnel",
    {
      title: "Open VM migration tunnel",
      description: "Open a tunnel for VM migration. Returns port/ticket info for the migration proxy.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          port: z.number().int().min(1).max(65535).optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, port }) =>
      runTool(ctx, "vm_mtunnel", { node, vmid, port }, async () => {
        const body: Record<string, unknown> = {};
        if (port !== undefined) body.port = port;
        const data = await ctx.client.post(paths.qemuMtunnel(node, vmid), body);
        return jsonResult(`Migration tunnel for VM ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "vm_mtunnelwebsocket",
    {
      title: "Upgrade migration tunnel to WebSocket",
      description: "Upgrade an existing migration tunnel to a WebSocket.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          port: z.number().int().min(1).max(65535).optional(),
          ticket: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, port, ticket }) =>
      runTool(ctx, "vm_mtunnelwebsocket", { node, vmid, port, ticket }, async () => {
        const body: Record<string, unknown> = {};
        if (port !== undefined) body.port = port;
        if (ticket) body.ticket = ticket;
        const data = await ctx.client.post(paths.qemuMtunnelWebsocket(node, vmid), body);
        return jsonResult(`Migration WebSocket ticket:`, data);
      }),
  );

  server.registerTool(
    "vm_feature",
    {
      title: "Toggle VM feature",
      description:
        "Enable or disable a Proxmox VM feature (snapshot, clone, clone_from_template, migration).",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          feature: z
            .enum(["snapshot", "clone", "clone_from_template", "migration", "suspend"])
            .describe("Feature name"),
          enable: z.boolean().default(true).describe("Enable (true) or disable (false)"),
          force: z.boolean().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ node, vmid, feature, enable, force }) =>
      runTool(ctx, "vm_feature", { node, vmid, feature, enable, force }, async () => {
        const body: Record<string, unknown> = { feature, enable: enable ? 1 : 0 };
        if (force !== undefined) body.force = force ? 1 : 0;
        const data = await ctx.client.post(paths.qemuFeature(node, vmid), body);
        return jsonResult(`VM ${vmid} feature ${feature} → ${enable ? "on" : "off"}.`, data);
      }),
  );
}