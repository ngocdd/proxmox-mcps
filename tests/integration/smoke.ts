/**
 * End-to-end smoke test against a real Proxmox cluster.
 *
 * Usage: PROXMOX_E2E=1 npx tsx tests/integration/smoke.ts
 *
 * Required env vars:
 *   PROXMOX_HOST, PROXMOX_PORT, PROXMOX_USER, PROXMOX_TOKEN_NAME, PROXMOX_TOKEN_VALUE
 *   PROXMOX_VERIFY_SSL (optional)
 *   PROXMOX_DEV_MODE (recommended)
 */
import { loadConfig } from "../../src/config/index.js";
import { getLogger } from "../../src/log.js";
import { ProxmoxClient } from "../../src/proxmox/client.js";
import { clusterResources } from "../../src/proxmox/paths.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = getLogger({ level: cfg.logLevel, pretty: cfg.logPretty });

  logger.info({ host: cfg.proxmox.host, user: cfg.proxmox.user }, "smoke.start");

  const client = new ProxmoxClient({
    proxmox: cfg.proxmox,
    retry: { max: cfg.retryJob.retryMax, baseMs: cfg.retryJob.retryBaseMs },
    logger,
  });

  // 1. /cluster/resources?type=vm — list all VMs + CTs
  logger.info("→ Listing cluster resources...");
  const resources = (await client.get(clusterResources("vm"))) as Array<Record<string, unknown>>;
  const vms = resources.filter((r) => r.type === "qemu");
  const lxc = resources.filter((r) => r.type === "lxc");
  logger.info({ qemu: vms.length, lxc: lxc.length }, "smoke.resources_ok");
  console.log(`  QEMU VMs: ${vms.length}, LXC containers: ${lxc.length}`);

  // 2. /cluster/status — quorum + nodes
  logger.info("→ Fetching cluster status...");
  const status = (await client.get("/cluster/status")) as { name?: string; quorate?: number };
  logger.info({ cluster: status.name, quorate: status.quorate }, "smoke.status_ok");
  console.log(`  Cluster: ${status.name ?? "?"}, quorate: ${status.quorate ?? "?"}`);

  // 3. /storage — storage pools
  logger.info("→ Fetching storage pools...");
  const storage = (await client.get("/storage")) as Array<{ storage: string; type: string }>;
  logger.info({ pools: storage.length }, "smoke.storage_ok");
  console.log(`  Storage pools: ${storage.length} (${storage.map((s) => s.storage).join(", ")})`);

  console.log("\n[OK] Smoke test passed.");
}

main().catch((err) => {
  console.error("[FAIL]", err instanceof Error ? err.message : String(err));
  process.exit(1);
});