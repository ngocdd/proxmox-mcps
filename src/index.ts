#!/usr/bin/env node
/**
 * Entry point. Wires env → AppConfig → McpServer → transport (stdio/sse/streamable).
 *
 * Transport is selected via MCP_TRANSPORT env var:
 *  - STDIO:     default; for Claude Code integration
 *  - SSE:       legacy HTTP+SSE
 *  - STREAMABLE: streamable HTTP (recommended for non-stdio clients)
 *
 * Use `npm run dev` for tsx watch, or `npm run build && npm start` for prod.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, loadLoggerConfig } from "./config/index.js";
import { getLogger } from "./log.js";
import { buildServer } from "./server.js";
import { registerAll } from "./tools/index.js";

async function main(): Promise<void> {
  // Initialize logger first so we can report config errors.
  const loggerCfg = loadLoggerConfig();
  const logger = getLogger(loggerCfg);

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "config.load_failed");
    process.exit(2);
  }

  const transport = config.retryJob.jobStore === "sqlite" ? "sqlite-jobs" : "memory-jobs"; // placeholder so the line above compiles
  void transport;

  logger.info(
    {
      host: config.proxmox.host,
      port: config.proxmox.port,
      user: config.proxmox.user,
      verifySsl: config.proxmox.verifySsl,
      devMode: config.safety.devMode,
      jobStore: config.retryJob.jobStore,
    },
    "proxmox-mcps.starting",
  );

  if (config.safety.dangerouslyAllowDestructive) {
    logger.warn(
      "PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE=true — destructive tools will run without user confirmation",
    );
  }

  const { server, ctx, close } = buildServer({ config });

  registerAll(server, ctx);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "proxmox-mcps.shutting_down");
    try {
      await close();
    } catch (err) {
      logger.error({ err }, "proxmox-mcps.shutdown_error");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Transport selection
  const mode = (process.env.MCP_TRANSPORT ?? "STDIO").toUpperCase();
  try {
    if (mode === "STDIO") {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info("proxmox-mcps.connected_stdio");
    } else if (mode === "SSE") {
      logger.warn("SSE transport falls back to streamable HTTP (legacy SSE mode not separately wired)");
      await startStreamable(server, ctx, logger);
      logger.info({ host: config.retryJob.httpHost, port: config.retryJob.httpPort }, "proxmox-mcps.connected_streamable");
    } else if (mode === "STREAMABLE") {
      await startStreamable(server, ctx, logger);
      logger.info({ host: config.retryJob.httpHost, port: config.retryJob.httpPort }, "proxmox-mcps.connected_streamable");
    } else {
      throw new Error(`Unknown MCP_TRANSPORT: ${mode}`);
    }
  } catch (err) {
    logger.fatal({ err, mode }, "proxmox-mcps.connect_failed");
    process.exit(1);
  }
}

async function startStreamable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any,
  _ctx: unknown,
  logger: ReturnType<typeof getLogger>,
): Promise<unknown> {
  // Dynamic import to avoid loading express/uuid when stdio mode is used
  const http = await import("node:http");
  const { randomUUID } = await import("node:crypto");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const { isInitializeRequest } = await import("@modelcontextprotocol/sdk/types.js");

  // Hard cap on incoming JSON-RPC body size. Default 1 MiB. Prevents DoS via
  // a single oversized request (the body is accumulated into a Buffer below).
  const MAX_BODY_BYTES = 1_048_576;
  const rejectPayload = (res: import("node:http").ServerResponse, code: number, msg: string): void => {
    res.statusCode = code;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(msg);
  };

  const config = loadConfig();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid: string) => {
      logger.info({ sessionId: sid }, "session.initialized");
    },
  });

  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    if (!req.url) {
      rejectPayload(res, 400, "Bad Request");
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", service: "proxmox-mcps" }));
      return;
    }

    if (url.pathname === "/mcp") {
      // DELETE /mcp — close the session and tear down the transport.
      if (req.method === "DELETE") {
        await transport.close();
        res.statusCode = 200;
        res.end();
        return;
      }

      // GET /mcp is reserved by the SDK (SSE stream); pass through.
      if (req.method === "GET") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleReq = (transport as unknown as { handleRequest: (req: unknown, res: unknown, body?: unknown) => Promise<void> }).handleRequest.bind(transport);
        await handleReq(req, res, undefined);
        return;
      }

      // POST /mcp — the only path that carries a JSON-RPC body.
      if (req.method !== "POST") {
        rejectPayload(res, 405, "Method Not Allowed");
        return;
      }

      // Enforce Content-Type: application/json (and any charset suffix).
      const ct = (req.headers["content-type"] ?? "").toLowerCase();
      if (!ct.startsWith("application/json")) {
        rejectPayload(res, 415, "Content-Type must be application/json");
        return;
      }

      // Reject upfront if Content-Length is already over the cap.
      const declared = Number.parseInt(req.headers["content-length"] ?? "", 10);
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        rejectPayload(res, 413, "Payload Too Large");
        return;
      }

      // Accumulate body, abort if it grows past the cap during streaming.
      const chunks: Buffer[] = [];
      let total = 0;
      let aborted = false;
      try {
        for await (const chunk of req) {
          const buf = chunk as Buffer;
          total += buf.length;
          if (total > MAX_BODY_BYTES) {
            aborted = true;
            break;
          }
          chunks.push(buf);
        }
      } catch {
        // socket error; nothing to do — response will be aborted by Node
      }
      if (aborted) {
        rejectPayload(res, 413, "Payload Too Large");
        return;
      }
      const body = Buffer.concat(chunks).toString("utf8");
      let parsed: unknown;
      try {
        parsed = body ? JSON.parse(body) : undefined;
      } catch {
        rejectPayload(res, 400, "Invalid JSON");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleReq = (transport as unknown as { handleRequest: (req: unknown, res: unknown, body?: unknown) => Promise<void> }).handleRequest.bind(transport);
      await handleReq(req, res, parsed);
      return;
    }

    rejectPayload(res, 404, "Not Found");
  });

  void isInitializeRequest; // silence unused

  await new Promise<void>((resolve) =>
    httpServer.listen(config.retryJob.httpPort, config.retryJob.httpHost, resolve),
  );
  logger.info(
    { host: config.retryJob.httpHost, port: config.retryJob.httpPort },
    "proxmox-mcps.http_listening",
  );
  return httpServer;
}

main().catch((err) => {
  process.stderr.write(`[FATAL] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});