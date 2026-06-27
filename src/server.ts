/**
 * McpServer factory + DI wiring.
 *
 * Builds ProxmoxClient, SshClient, logger, policy gate, job store, and the
 * McpServer instance. Tools are registered via `registerAll(server, ctx)`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config/types.js";
import { ProxmoxClient } from "./proxmox/client.js";
import { SshClient } from "./ssh/client.js";
import type { ToolContext } from "./tools/context.js";
import { getLogger } from "./log.js";
import { PolicyGate } from "./safety/policy.js";
import { InMemoryJobStore } from "./jobs/store.js";
import { SqliteJobStore } from "./jobs/sqlite-store.js";
import type { JobStore } from "./jobs/store.js";

export interface BuildServerOptions {
  config: AppConfig;
}

export interface BuiltServer {
  server: McpServer;
  ctx: ToolContext;
  close: () => Promise<void>;
}

/**
 * Construct the McpServer + ToolContext. Tools themselves are NOT registered
 * here — call `registerAll(server, ctx)` from tools/index.ts separately to
 * avoid circular imports during early bootstrap.
 */
export function buildServer(opts: BuildServerOptions): BuiltServer {
  const logger = getLogger({ level: opts.config.logLevel, pretty: opts.config.logPretty });

  const client = new ProxmoxClient({
    proxmox: opts.config.proxmox,
    retry: {
      max: opts.config.retryJob.retryMax,
      baseMs: opts.config.retryJob.retryBaseMs,
    },
    logger: logger.child({ module: "proxmox-client" }),
  });

  const ssh = new SshClient({
    ssh: opts.config.ssh,
    logger: logger.child({ module: "ssh-client" }),
  });

  const policy = new PolicyGate({
    safety: opts.config.safety,
    logger: logger.child({ module: "policy" }),
  });

  // Choose JobStore implementation based on config
  let jobs: JobStore & { close?: () => void };
  if (opts.config.retryJob.jobStore === "sqlite") {
    jobs = new SqliteJobStore({
      sqlitePath: opts.config.retryJob.jobSqlitePath,
      ttlHours: opts.config.retryJob.jobTtlHours,
      logger: logger.child({ module: "jobs-sqlite" }),
    });
    logger.info(
      { path: opts.config.retryJob.jobSqlitePath },
      "jobs.sqlite_enabled",
    );
  } else {
    jobs = new InMemoryJobStore({
      ttlHours: opts.config.retryJob.jobTtlHours,
      logger: logger.child({ module: "jobs-memory" }),
    });
    logger.info("jobs.memory_enabled");
  }

  const server = new McpServer(
    { name: "ProxmoxMCP", version: "0.2.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Proxmox MCP server: manage QEMU VMs and LXC containers, snapshots, backups, ISOs, diagnostics, and console access on a Proxmox VE cluster.",
    },
  );

  const ctx: ToolContext = {
    client,
    ssh,
    policy,
    jobs,
    logger,
    config: opts.config,
  };

  const close = async (): Promise<void> => {
    client.close();
    ssh.close();
    if (typeof jobs.close === "function") jobs.close();
  };

  return { server, ctx, close };
}