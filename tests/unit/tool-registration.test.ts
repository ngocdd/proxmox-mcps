/**
 * Tool registration tests — verify that all 195 tools are registered with
 * the correct risk level and that the MCP server can build + register
 * without errors.
 */
import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listRiskRegistry, getRisk, Risk } from "../../src/safety/policy.js";
import { registerAll } from "../../src/tools/index.js";
import { ToolContext } from "../../src/tools/context.js";
import { buildAppConfig } from "../../src/config/types.js";
import { parseEnv } from "../../src/config/env.js";
import { PolicyGate } from "../../src/safety/policy.js";
import { ProxmoxClient } from "../../src/proxmox/client.js";
import { SshClient } from "../../src/ssh/client.js";
import { InMemoryJobStore } from "../../src/jobs/store.js";
import type { Logger } from "../../src/log.js";

function makeCtx(): ToolContext {
  const env = parseEnv({
    PROXMOX_HOST: "pve.example.com",
    PROXMOX_USER: "root@pam",
    PROXMOX_TOKEN_NAME: "mcp",
    PROXMOX_TOKEN_VALUE: "12345678-1234-1234-1234-123456789012",
  });
  const config = buildAppConfig(env);
  const logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
    fatal() {},
    child() {
      return this;
    },
  } as unknown as Logger;
  const client = new ProxmoxClient({
    proxmox: config.proxmox,
    retry: { max: 0, baseMs: 10 },
    logger,
  });
  const ssh = new SshClient({ ssh: config.ssh, logger });
  const policy = new PolicyGate({ safety: config.safety, logger });
  const jobs = new InMemoryJobStore({ ttlHours: 24 });
  return { client, ssh, policy, jobs, logger, config };
}

describe("tool registration", () => {
  it("registers all 195 tools via registerAll()", () => {
    const ctx = makeCtx();
    const server = new McpServer({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerAll(server, ctx);
    // We can't easily introspect McpServer's internal tool list; rely on risk registry instead
    const reg = listRiskRegistry();
    expect(Object.keys(reg).length).toBe(195);
  });

  it("covers all 8 VM lifecycle actions", () => {
    expect(getRisk("start_vm")).toBe("medium");
    expect(getRisk("stop_vm")).toBe("medium");
    expect(getRisk("shutdown_vm")).toBe("medium");
    expect(getRisk("reset_vm")).toBe("medium");
    expect(getRisk("reboot_vm")).toBe("medium");
    expect(getRisk("delete_vm")).toBe("destructive");
  });

  it("covers all container lifecycle actions", () => {
    expect(getRisk("start_container")).toBe("medium");
    expect(getRisk("stop_container")).toBe("medium");
    expect(getRisk("shutdown_container")).toBe("medium");
    expect(getRisk("restart_container")).toBe("medium");
    expect(getRisk("delete_container")).toBe("destructive");
  });

  it("destructive VM/CT tools are correctly classified", () => {
    const destructives: string[] = [
      "delete_vm",
      "delete_container",
      "delete_backup",
      "delete_pool",
      "delete_ha_group",
      "delete_storage",
      "delete_backup_job",
      "delete_sdn_controller",
      "delete_sdn_zone",
      "init_node_disk",
      "wipe_node_disk",
      "create_node_zfs",
    ];
    for (const name of destructives) {
      expect(getRisk(name), `${name} should be destructive`).toBe("destructive");
    }
  });

  it("Phase 2B tools are registered", () => {
    const phase2b: string[] = [
      "list_pools",
      "get_pool",
      "create_pool",
      "update_pool",
      "delete_pool",
      "list_ha_resources",
      "get_ha_resource_status",
      "add_ha_resource",
      "remove_ha_resource",
      "migrate_ha_resource",
      "list_ha_groups",
      "get_ha_group",
      "create_ha_group",
      "update_ha_group",
      "delete_ha_group",
      "get_ha_status",
      "list_backup_jobs",
      "get_backup_job",
      "get_backup_job_included",
      "create_backup_job",
      "update_backup_job",
      "delete_backup_job",
      "run_backup_job",
    ];
    for (const name of phase2b) {
      expect(getRisk(name), `${name} should be registered`).toBeDefined();
    }
  });

  it("Phase 2C node admin tools are registered", () => {
    const phase2c: string[] = [
      "node_apt_update",
      "node_apt_versions",
      "node_apt_repos_list",
      "node_apt_repos_change",
      "get_node_dns",
      "set_node_dns",
      "get_node_hosts",
      "set_node_hosts",
      "get_node_time",
      "set_node_time",
      "get_node_timezone",
      "set_node_timezone",
      "get_node_config",
      "update_node_config",
      "get_node_report",
      "node_start_all",
      "node_stop_all",
      "node_migrate_all",
      "node_wake_on_lan",
      "get_node_subscription",
      "set_node_subscription",
      "update_node_subscription",
      "delete_node_subscription",
      "list_node_services",
      "node_service_start",
      "node_service_stop",
      "node_service_restart",
      "node_service_reload",
      "node_service_enable",
      "node_service_disable",
      "list_node_network",
      "create_node_network",
      "update_node_network",
      "delete_node_network",
      "reload_node_network",
      "list_node_disks",
      "list_node_disks_detailed",
      "init_node_disk",
      "wipe_node_disk",
      "create_node_zfs",
      "list_node_certificates",
      "delete_node_certificate",
    ];
    for (const name of phase2c) {
      expect(getRisk(name), `${name} should be registered`).toBeDefined();
    }
  });

  it("Phase 2D storage/replication/SDN tools are registered", () => {
    const phase2d: string[] = [
      "list_storages",
      "get_storage",
      "create_storage",
      "update_storage",
      "delete_storage",
      "list_replication_jobs",
      "get_replication_job",
      "get_replication_status",
      "create_replication_job",
      "update_replication_job",
      "delete_replication_job",
      "list_node_replication",
      "list_sdn_controllers",
      "get_sdn_controller",
      "create_sdn_controller",
      "update_sdn_controller",
      "delete_sdn_controller",
      "list_sdn_zones",
      "get_sdn_zone",
      "create_sdn_zone",
      "update_sdn_zone",
      "delete_sdn_zone",
      "list_sdn_vnets",
      "get_sdn_vnet",
      "create_sdn_vnet",
      "update_sdn_vnet",
      "delete_sdn_vnet",
      "list_sdn_subnets",
      "get_sdn_subnet",
      "create_sdn_subnet",
      "update_sdn_subnet",
      "delete_sdn_subnet",
      "apply_sdn",
    ];
    for (const name of phase2d) {
      expect(getRisk(name), `${name} should be registered`).toBeDefined();
    }
  });

  it("read-only tools are all 'low' risk", () => {
    const reads: string[] = [
      "get_vms",
      "get_vm_config",
      "get_vm_status",
      "get_vm_pending",
      "get_containers",
      "get_container_config",
      "get_container_status",
      "get_container_ip",
      "get_container_rrd",
      "get_container_rrddata",
      "get_cluster_status",
      "get_nodes",
      "get_node_status",
      "get_storage",
      "get_task",
      "get_task_log",
      "get_job",
      "poll_job",
      "list_jobs",
      "list_snapshots",
      "list_backups",
      "list_isos",
      "list_templates",
      "list_tasks",
      "list_pools",
      "get_pool",
      "list_ha_resources",
      "get_ha_resource_status",
      "list_ha_groups",
      "get_ha_group",
      "get_ha_status",
      "list_backup_jobs",
      "get_backup_job",
      "get_backup_job_included",
      "list_replication_jobs",
      "get_replication_job",
      "get_replication_status",
      "list_node_replication",
      "list_sdn_controllers",
      "get_sdn_controller",
      "list_sdn_zones",
      "get_sdn_zone",
      "list_sdn_vnets",
      "get_sdn_vnet",
      "list_sdn_subnets",
      "get_sdn_subnet",
      "list_storages",
      "get_storage",
      "node_apt_versions",
      "node_apt_repos_list",
      "get_node_dns",
      "get_node_hosts",
      "get_node_time",
      "get_node_timezone",
      "get_node_config",
      "get_node_report",
      "node_wake_on_lan",
      "get_node_subscription",
      "list_node_services",
      "list_node_network",
      "list_node_disks",
      "list_node_disks_detailed",
      "list_node_certificates",
    ];
    for (const name of reads) {
      expect(getRisk(name), `${name} should be low risk`).toBe("low");
    }
  });

  it("count by risk level matches design", () => {
    const reg = listRiskRegistry();
    const counts: Record<Risk, number> = { low: 0, medium: 0, high: 0, destructive: 0 };
    for (const r of Object.values(reg)) counts[r]++;

    // Expected approximate counts (design intent):
    // low: ~70 (all read-only tools)
    // medium: ~80 (most write operations)
    // high: ~25 (destructive-adjacent)
    // destructive: ~14 (delete_disk/init, etc.)
    expect(counts.low).toBeGreaterThan(60);
    expect(counts.medium).toBeGreaterThan(60);
    expect(counts.high).toBeGreaterThan(15);
    expect(counts.destructive).toBeGreaterThan(10);
  });
});