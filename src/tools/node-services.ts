/**
 * Node services management (systemd-like).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerNodeServicesTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_node_services",
    {
      title: "List node services",
      description: "List all systemd services on a node with their state.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "list_node_services", { node }, async () => {
        const data = await ctx.client.get(paths.nodeServices(node));
        return jsonResult(`Services on ${node}:`, data);
      }),
  );

  const serviceAction = (
    name: string,
    action: "start" | "stop" | "restart" | "reload" | "enable" | "disable",
    desc: string,
  ): void => {
    server.registerTool(
      name,
      {
        title: name.replace(/_/g, " "),
        description: desc,
        inputSchema: z
          .object({ node: z.string().min(1), service: z.string().min(1).describe("Service name") })
          .strict(),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async ({ node, service }) =>
        runTool(ctx, name, { node, service }, async () => {
          await ctx.client.post(paths.nodeService(node, service), { action });
          return jsonResult(`Service ${service} ${action} on ${node}.`, { node, service, action });
        }),
    );
  };

  serviceAction("node_service_start", "start", "Start a systemd service.");
  serviceAction("node_service_stop", "stop", "Stop a systemd service.");
  serviceAction("node_service_restart", "restart", "Restart a systemd service.");
  serviceAction("node_service_reload", "reload", "Reload a systemd service.");
  serviceAction("node_service_enable", "enable", "Enable a systemd service at boot.");
  serviceAction("node_service_disable", "disable", "Disable a systemd service at boot.");
}