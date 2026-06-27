/**
 * Cluster-level tools: get_cluster_status.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerClusterTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_cluster_status",
    {
      title: "Get Proxmox cluster status",
      description:
        "Return quorum status, cluster name/version, and a list of nodes with their online state and IDs.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "get_cluster_status", {}, async () => {
        const data = await ctx.client.get(paths.clusterStatus());
        return jsonResult("Cluster status:", data);
      }),
  );
}