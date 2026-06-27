/**
 * Storage tools: get_storage.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerStorageTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_storage",
    {
      title: "List Proxmox storage pools",
      description:
        "List all configured storage pools cluster-wide with type, content types, and aggregate usage.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      runTool(ctx, "get_storage", {}, async () => {
        const data = await ctx.client.get(paths.storage());
        return jsonResult("Storage:", data);
      }),
  );
}