/**
 * ISO & OS template tools: list_isos, list_templates, download_iso, delete_iso.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as paths from "../proxmox/paths.js";
import type { ToolContext } from "./context.js";
import { runTool, jsonResult, errResult } from "../format/response.js";
import { trackUpid } from "./helpers.js";
import { validateDownloadUrl } from "../security/url-guard.js";

const ChecksumAlgoSchema = z.enum(["md5", "sha1", "sha256", "sha512"]).default("sha256");

export function registerIsoTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_isos",
    {
      title: "List ISO images",
      description: "List ISO images available on the cluster.",
      inputSchema: z
        .object({
          node: z.string().optional().describe("Filter by node"),
          storage: z.string().optional().describe("Filter by storage"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, storage }) =>
      runTool(ctx, "list_isos", { node, storage }, async () => {
        const all = await scanStoragesForContent(ctx, "iso", node, storage);
        return jsonResult(`ISOs (${all.flatMap((r) => r.entries).length}):`, all);
      }),
  );

  server.registerTool(
    "list_templates",
    {
      title: "List OS templates",
      description: "List LXC OS templates (vztmpl) available on the cluster.",
      inputSchema: z
        .object({
          node: z.string().optional(),
          storage: z.string().optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ node, storage }) =>
      runTool(ctx, "list_templates", { node, storage }, async () => {
        const all = await scanStoragesForContent(ctx, "vztmpl", node, storage);
        return jsonResult(`Templates (${all.flatMap((r) => r.entries).length}):`, all);
      }),
  );

  server.registerTool(
    "download_iso",
    {
      title: "Download ISO/template from URL",
      description:
        "Trigger a server-side download from a URL into a storage pool (useful for large ISOs). Proxmox fetches the file directly.",
      inputSchema: z
        .object({
          node: z.string().min(1).describe("Target node"),
          storage: z.string().min(1).describe("Target storage"),
          url: z.string().url().describe("Source URL (http/https/ftp)"),
          filename: z.string().min(1).describe("Destination filename"),
          checksum: z.string().optional().describe("Optional checksum for verification"),
          checksum_algorithm: ChecksumAlgoSchema,
          content: z.enum(["iso", "vztmpl"]).default("iso").describe("Content type"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, storage, url, filename, checksum, checksum_algorithm, content }) =>
      runTool(ctx, "download_iso", { node, storage, url, filename, content }, async () => {
        // SSRF guard: reject private/loopback IPs and enforce operator allowlist.
        const guard = await validateDownloadUrl(url, {
          allowedSchemes: ctx.config.download.allowedSchemes,
          allowedHosts: ctx.config.download.allowedHosts,
        });
        if (!guard.ok) {
          return errResult(`❌ Download rejected: ${guard.reason}`);
        }
        const body: Record<string, unknown> = {
          url,
          filename,
          content,
        };
        if (checksum) {
          body.checksum = checksum_algorithm + ":" + checksum;
        }
        const upid = await ctx.client.post<string>(paths.storageDownloadUrl(node, storage), body);
        const job = trackUpid(ctx, upid, { node, tool: "download_iso", args: { node, storage, url, filename } });
        return jsonResult(`Download started.`, { job_id: job.job_id, upid });
      }),
  );

  server.registerTool(
    "delete_iso",
    {
      title: "Delete ISO/template",
      description:
        "Permanently delete an ISO or template. DESTRUCTIVE — ask the user to confirm before invoking.",
      inputSchema: z
        .object({
          node: z.string().min(1),
          storage: z.string().min(1),
          filename: z.string().min(1).describe("Filename (e.g. 'ubuntu-22.04.iso')"),
          confirm: z.boolean().optional().describe("Set to true once the user has approved this destructive action"),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ node, storage, filename, confirm }) =>
      runTool(ctx, "delete_iso", { node, storage, filename, confirm }, async () => {
        const volid = `${storage}:${filename}`;
        await ctx.client.delete(paths.storageContent(node, storage, volid));
        return jsonResult(`ISO/template deleted.`, { node, storage, volid });
      }),
  );
}

async function scanStoragesForContent(
  ctx: ToolContext,
  content: "iso" | "vztmpl",
  nodeFilter?: string,
  storageFilter?: string,
): Promise<Array<{ node: string; storage: string; entries: unknown[] }>> {
  const allStorage = (await ctx.client.get<Array<{ storage: string; content?: string }>>(
    paths.storage(),
  )) as Array<{ storage: string; content?: string }>;
  const matching = allStorage.filter((s) =>
    storageFilter ? s.storage === storageFilter : (s.content ?? "").includes(content),
  );

  const nodes = nodeFilter
    ? [nodeFilter]
    : ((await ctx.client.get<Array<{ node: string }>>(paths.nodes())) as Array<{ node: string }>).map(
        (n) => n.node,
      );

  const results: Array<{ node: string; storage: string; entries: unknown[] }> = [];
  for (const n of nodes) {
    for (const s of matching) {
      try {
        const entries = (await ctx.client.get<unknown[]>(
          paths.nodeStorageContent(n, s.storage, content),
        )) as unknown[];
        if (entries.length > 0) results.push({ node: n, storage: s.storage, entries });
      } catch {
        // skip
      }
    }
  }
  return results;
}