import { describe, expect, it } from "vitest";
import {
  getRisk,
  listRiskRegistry,
} from "../../src/safety/policy.js";
// Side-effect import: triggers registration
import "../../src/safety/risk.js";

describe("risk registry", () => {
  it("registers known tool names with their risk", () => {
    expect(getRisk("get_vms")).toBe("low");
    expect(getRisk("create_vm")).toBe("medium");
    expect(getRisk("delete_vm")).toBe("destructive");
    expect(getRisk("rollback_snapshot")).toBe("destructive");
    expect(getRisk("restore_backup")).toBe("destructive");
    expect(getRisk("delete_backup")).toBe("destructive");
  });

  it("returns 'low' for unknown tools", () => {
    expect(getRisk("does_not_exist")).toBe("low");
  });

  it("contains the expected number of tools", () => {
    const reg = listRiskRegistry();
    expect(Object.keys(reg).length).toBeGreaterThan(80);
  });

  it("every destructive tool requires explicit acknowledgment", () => {
    const reg = listRiskRegistry();
    const destructives = Object.entries(reg).filter(([, r]) => r === "destructive");
    // Allow-list: every destructive tool MUST appear here. Adding a new
    // destructive tool without listing it fails the test (safety net).
    const allowedDestructives = [
      // VM/Container
      "delete_vm",
      "delete_container",
      "convert_vm_to_template",
      "convert_container_to_template",
      // Snapshots
      "delete_snapshot",
      "rollback_snapshot",
      // Backup
      "delete_backup",
      "restore_backup",
      "delete_backup_job",
      // ISO
      "delete_iso",
      // Pools
      "delete_pool",
      // HA
      "delete_ha_group",
      "remove_ha_resource",
      // Replication
      "delete_replication_job",
      // SDN
      "delete_sdn_controller",
      "delete_sdn_zone",
      "delete_sdn_vnet",
      "delete_sdn_subnet",
      "apply_sdn",
      // Node
      "init_node_disk",
      "wipe_node_disk",
      "create_node_zfs",
      "delete_node_network",
      "delete_node_certificate",
      // Storage
      "delete_storage",
    ];
    expect(destructives.length).toBeGreaterThan(15);
    expect(destructives.length).toBe(allowedDestructives.length);
    for (const [name] of destructives) {
      expect(allowedDestructives, `${name} must be in the allow-list`).toContain(name);
    }
    // And the reverse: every allowedDestructive must actually be registered as destructive
    for (const name of allowedDestructives) {
      expect(getRisk(name), `${name} should be destructive`).toBe("destructive");
    }
  });
});