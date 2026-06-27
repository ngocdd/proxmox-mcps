/**
 * Node certificate management (ACME/custom).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult } from "../format/response.js";

export function registerNodeCertsTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_node_certificates",
    {
      title: "List node certificates",
      description: "Return all custom certificates installed on a node.",
      inputSchema: z.object({ node: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ node }) =>
      runTool(ctx, "list_node_certificates", { node }, async () => {
        const data = await ctx.client.get(paths.nodeCert(node));
        return jsonResult(`Certificates on ${node}:`, data);
      }),
  );

  server.registerTool(
    "delete_node_certificate",
    {
      title: "Delete node certificate",
      description:
        "Delete a custom certificate from a node. HIGH RISK — reverts to self-signed. Ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          certname: z.string().min(1).describe("Certificate name"),
          restart: z.boolean().optional().describe("Restart pveproxy after deletion"),
          force: z.boolean().optional(),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ node, certname, restart, force, confirm }) =>
      runTool(ctx, "delete_node_certificate", { node, certname, restart, force, confirm }, async () => {
        const params: Record<string, unknown> = {};
        if (restart !== undefined) params.restart = restart ? 1 : 0;
        if (force !== undefined) params.force = force ? 1 : 0;
        await ctx.client.delete(`${paths.nodeCert(node)}/${encodeURIComponent(certname)}`, params);
        return jsonResult(`Certificate ${certname} deleted on ${node}.`, { certname });
      }),
  );
}