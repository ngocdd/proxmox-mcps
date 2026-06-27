/**
 * Container Console & remote access tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../../proxmox/paths.js";
import type { ToolContext } from "../context.js";
import { runTool, jsonResult } from "../../format/response.js";

export function registerContainerConsoleTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "container_vncproxy",
    {
      title: "Get container VNC proxy ticket",
      description: "Generate a VNC ticket for an LXC container console.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          vmid: z.string().regex(/^\d+$/),
          websocket: z.boolean().optional(),
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
      runTool(ctx, "container_vncproxy", { node, vmid, websocket }, async () => {
        const body: Record<string, unknown> = { websocket: websocket === false ? 0 : 1 };
        const data = await ctx.client.post(paths.lxcVncProxy(node, vmid), body);
        return jsonResult(`VNC ticket for container ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "container_termproxy",
    {
      title: "Get container terminal proxy ticket",
      description: "Generate a terminal proxy ticket for an LXC container.",
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
      runTool(ctx, "container_termproxy", { node, vmid }, async () => {
        const data = await ctx.client.post(paths.lxcTermProxy(node, vmid));
        return jsonResult(`Terminal ticket for container ${vmid}:`, data);
      }),
  );

  server.registerTool(
    "container_spiceproxy",
    {
      title: "Get container SPICE proxy ticket",
      description: "Generate a SPICE ticket for an LXC container.",
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
      runTool(ctx, "container_spiceproxy", { node, vmid }, async () => {
        const data = await ctx.client.post(paths.lxcSpiceProxy(node, vmid));
        return jsonResult(`SPICE ticket for container ${vmid}:`, data);
      }),
  );
}