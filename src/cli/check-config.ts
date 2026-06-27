#!/usr/bin/env node
/**
 * `proxmox-mcps check-config` (binary `proxmox-mcps-check-config`) —
 * validate environment variables without starting the MCP server.
 */
import { loadConfig } from "../config/index.js";

try {
  const cfg = loadConfig();
  process.stdout.write(
    `[OK] Configuration is valid.\n\n` +
      `  Proxmox: ${cfg.proxmox.user}@${cfg.proxmox.host}:${cfg.proxmox.port}\n` +
      `  Service: ${cfg.proxmox.service}\n` +
      `  Verify SSL: ${cfg.proxmox.verifySsl}\n` +
      `  Dev mode: ${cfg.safety.devMode}\n` +
      `  Dangerously allow destructive: ${cfg.safety.dangerouslyAllowDestructive}\n` +
      `  Audit only: ${cfg.safety.auditOnly}\n` +
      `  Log level: ${cfg.logLevel}\n` +
      `  SSH user: ${cfg.ssh.user}@*:${cfg.ssh.port}\n` +
      `  SSH key file: ${cfg.ssh.keyFile ?? "(none)"}\n` +
      `  Retry max: ${cfg.retryJob.retryMax} (base ${cfg.retryJob.retryBaseMs}ms)\n` +
      `  Job TTL: ${cfg.retryJob.jobTtlHours}h\n`,
  );
  process.exit(0);
} catch (err) {
  process.stderr.write(
    `[FAIL] ${err instanceof Error ? err.message : String(err)}\n\n` +
      `Run 'cp .env.example .env' and fill in your Proxmox host + API token.\n`,
  );
  process.exit(2);
}