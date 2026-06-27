/**
 * ToolContext — dependency injection container passed to every tool.
 *
 * Built once in server.ts, passed to every register*(server, ctx) function.
 * Tools MUST NOT read process.env directly; everything they need is on ctx.
 */
import type { Logger } from "../log.js";
import type { AppConfig } from "../config/types.js";
import type { ProxmoxClient } from "../proxmox/client.js";
import type { SshClient } from "../ssh/client.js";
import type { PolicyGate } from "../safety/policy.js";
import type { JobStore } from "../jobs/store.js";

export interface ToolContext {
  client: ProxmoxClient;
  ssh: SshClient;
  policy: PolicyGate;
  jobs: JobStore;
  logger: Logger;
  config: AppConfig;
}