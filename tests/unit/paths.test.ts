import { describe, expect, it } from "vitest";
import * as paths from "../../src/proxmox/paths.js";

describe("path helpers — foundation", () => {
  it("builds cluster paths", () => {
    expect(paths.clusterStatus()).toBe("/cluster/status");
    expect(paths.clusterResources()).toBe("/cluster/resources");
    expect(paths.clusterResources("vm")).toBe("/cluster/resources?type=vm");
    expect(paths.clusterTasks()).toBe("/cluster/tasks");
  });

  it("builds node paths", () => {
    expect(paths.nodes()).toBe("/nodes");
    expect(paths.nodeStatus("pve")).toBe("/nodes/pve/status");
    expect(paths.nodeSyslog("pve")).toBe("/nodes/pve/syslog");
    expect(paths.nodeSyslog("pve", 100)).toBe("/nodes/pve/syslog?limit=100");
    expect(paths.nodeJournal("pve", 50)).toBe("/nodes/pve/journal?limit=50");
  });

  it("builds storage paths", () => {
    expect(paths.storage()).toBe("/storage");
    expect(paths.nodeStorageStatus("pve", "local-lvm")).toBe("/nodes/pve/storage/local-lvm/status");
    expect(paths.nodeStorageContent("pve", "local", "iso")).toBe("/nodes/pve/storage/local/content?content=iso");
    expect(paths.nodeStorageContent("pve", "local", "backup")).toBe("/nodes/pve/storage/local/content?content=backup");
    expect(paths.storageContent("pve", "local", "local:vztmpl/alpine.tar.xz")).toBe(
      "/nodes/pve/storage/local/content/local:vztmpl/alpine.tar.xz",
    );
  });
});

describe("path helpers — VM (QEMU)", () => {
  it("builds QEMU endpoints", () => {
    expect(paths.qemu("pve")).toBe("/nodes/pve/qemu");
    expect(paths.qemuVm("pve", 100)).toBe("/nodes/pve/qemu/100");
    expect(paths.qemuConfig("pve", 100)).toBe("/nodes/pve/qemu/100/config");
    expect(paths.qemuPending("pve", 100)).toBe("/nodes/pve/qemu/100/pending");
  });

  it("builds QEMU status with action", () => {
    expect(paths.qemuStatus("pve", 100, "start")).toBe("/nodes/pve/qemu/100/status/start");
    expect(paths.qemuStatus("pve", 100, "shutdown")).toBe("/nodes/pve/qemu/100/status/shutdown");
    expect(paths.qemuStatus("pve", 100, "reboot")).toBe("/nodes/pve/qemu/100/status/reboot");
  });

  it("builds QEMU resize/move/unlink with disk parameter", () => {
    expect(paths.qemuResize("pve", 100, "scsi0")).toBe("/nodes/pve/qemu/100/resize?disk=scsi0");
    expect(paths.qemuMoveDisk("pve", 100, "scsi0")).toBe("/nodes/pve/qemu/100/move-disk?disk=scsi0");
    expect(paths.qemuUnlink("pve", 100, "scsi0")).toBe("/nodes/pve/qemu/100/unlink?disk=scsi0");
  });

  it("builds RRD paths with timeframe", () => {
    expect(paths.qemuRrd("pve", 100, "hour")).toBe("/nodes/pve/qemu/100/rrd?timeframe=hour");
    expect(paths.qemuRrdData("pve", 100, "day")).toBe("/nodes/pve/qemu/100/rrddata?timeframe=day");
  });

  it("builds agent paths for all known actions", () => {
    expect(paths.qemuAgent("pve", 100, "info")).toBe("/nodes/pve/qemu/100/agent/info");
    expect(paths.qemuAgent("pve", 100, "get-fsinfo")).toBe("/nodes/pve/qemu/100/agent/get-fsinfo");
    expect(paths.qemuAgent("pve", 100, "network-get-interfaces")).toBe(
      "/nodes/pve/qemu/100/agent/network-get-interfaces",
    );
    expect(paths.qemuAgentExec("pve", 100)).toBe("/nodes/pve/qemu/100/agent/exec");
    expect(paths.qemuAgentExecStatus("pve", 100, 12345)).toBe(
      "/nodes/pve/qemu/100/agent/exec-status?pid=12345",
    );
  });
});

describe("path helpers — LXC (Container)", () => {
  it("builds LXC endpoints", () => {
    expect(paths.lxc("pve")).toBe("/nodes/pve/lxc");
    expect(paths.lxcCt("pve", 101)).toBe("/nodes/pve/lxc/101");
    expect(paths.lxcConfig("pve", 101)).toBe("/nodes/pve/lxc/101/config");
    expect(paths.lxcClone("pve", 101)).toBe("/nodes/pve/lxc/101/clone");
  });

  it("builds LXC status with action", () => {
    expect(paths.lxcStatus("pve", 101, "start")).toBe("/nodes/pve/lxc/101/status/start");
    expect(paths.lxcStatus("pve", 101, "reboot")).toBe("/nodes/pve/lxc/101/status/reboot");
  });

  it("builds LXC firewall paths", () => {
    expect(paths.lxcFirewallRules("pve", 101)).toBe("/nodes/pve/lxc/101/firewall/rules");
    expect(paths.lxcFirewallOptions("pve", 101)).toBe("/nodes/pve/lxc/101/firewall/options");
  });

  it("builds LXC move-volume path", () => {
    expect(paths.lxcMoveVolume("pve", 101, "mp0")).toBe("/nodes/pve/lxc/101/move-volume?volume=mp0");
  });
});

describe("path helpers — Snapshots and tasks", () => {
  it("builds snapshot paths for both VM types", () => {
    expect(paths.snapshotList("pve", "qemu", 100)).toBe("/nodes/pve/qemu/100/snapshot");
    expect(paths.snapshotList("pve", "lxc", 101)).toBe("/nodes/pve/lxc/101/snapshot");
    expect(paths.snapshotDelete("pve", "qemu", 100, "pre-upgrade")).toBe(
      "/nodes/pve/qemu/100/snapshot/pre-upgrade",
    );
    expect(paths.snapshotRollback("pve", "lxc", 101, "old")).toBe(
      "/nodes/pve/lxc/101/snapshot/old/rollback",
    );
  });

  it("URL-encodes snapshot names with special chars", () => {
    expect(paths.snapshotDelete("pve", "qemu", 100, "before 2024")).toBe(
      "/nodes/pve/qemu/100/snapshot/before%202024",
    );
  });

  it("builds task paths", () => {
    const upid = "UPID:pve:000B5C66:1234:56";
    expect(paths.taskStatus("pve", upid)).toBe(`/nodes/pve/tasks/${encodeURIComponent(upid)}/status`);
    expect(paths.taskLog("pve", upid)).toBe(`/nodes/pve/tasks/${encodeURIComponent(upid)}/log`);
    expect(paths.taskLog("pve", upid, 50)).toBe(`/nodes/pve/tasks/${encodeURIComponent(upid)}/log?limit=50`);
    expect(paths.taskStop("pve", upid)).toBe(`/nodes/pve/tasks/${encodeURIComponent(upid)}/status/stop`);
  });

  it("builds vzdump path", () => {
    expect(paths.vzdump("pve")).toBe("/nodes/pve/vzdump");
  });
});

describe("path helpers — Phase 2B Pools", () => {
  it("builds pool paths", () => {
    expect(paths.pools()).toBe("/pools");
    expect(paths.pool("prod")).toBe("/pools/prod");
    expect(paths.pool("with-dash")).toBe("/pools/with-dash");
  });
});

describe("path helpers — Phase 2B HA", () => {
  it("builds HA resource paths", () => {
    expect(paths.haResources()).toBe("/cluster/ha");
    expect(paths.haResource("vm:100")).toBe("/cluster/ha/vm%3A100");
    expect(paths.haResourceStatus("ct:101")).toBe("/cluster/ha/ct%3A101/status");
  });

  it("builds HA group paths", () => {
    expect(paths.haGroups()).toBe("/cluster/ha/groups");
    expect(paths.haGroup("primary")).toBe("/cluster/ha/groups/primary");
    expect(paths.haStatus()).toBe("/cluster/ha/status");
  });
});

describe("path helpers — Phase 2B Backup Schedule", () => {
  it("builds backup job paths", () => {
    expect(paths.backupJobs()).toBe("/cluster/backup");
    expect(paths.backupJob("nightly")).toBe("/cluster/backup/nightly");
    expect(paths.runBackupJob("nightly")).toBe("/cluster/backup/nightly/run");
    expect(paths.backupJobIncluded("nightly")).toBe("/cluster/backup/nightly/included");
  });
});

describe("path helpers — Phase 2D Replication", () => {
  it("builds replication paths", () => {
    expect(paths.replication()).toBe("/cluster/replication");
    expect(paths.replicationJob("pve-100")).toBe("/cluster/replication/pve-100");
    expect(paths.replicationStatus("pve-100")).toBe("/cluster/replication/pve-100/status");
    expect(paths.nodeReplication("pve")).toBe("/nodes/pve/replication");
  });
});

describe("path helpers — Phase 2D SDN", () => {
  it("builds SDN controller paths", () => {
    expect(paths.sdnControllers()).toBe("/cluster/sdn/controllers");
    expect(paths.sdnController("evpn1")).toBe("/cluster/sdn/controllers/evpn1");
  });

  it("builds SDN zone paths", () => {
    expect(paths.sdnZones()).toBe("/cluster/sdn/zones");
    expect(paths.sdnZone("zone1")).toBe("/cluster/sdn/zones/zone1");
  });

  it("builds SDN vnet paths", () => {
    expect(paths.sdnVnets()).toBe("/cluster/sdn/vnets");
    expect(paths.sdnVnet("vnet-prod")).toBe("/cluster/sdn/vnets/vnet-prod");
  });

  it("builds SDN subnet paths", () => {
    expect(paths.sdnSubnets("vnet-prod")).toBe("/cluster/sdn/vnets/vnet-prod/subnets");
    expect(paths.sdnSubnet("vnet-prod", "10.10.0.0/24")).toBe(
      "/cluster/sdn/vnets/vnet-prod/subnets/10.10.0.0%2F24",
    );
  });
});

describe("path helpers — Phase 2C Node admin", () => {
  it("builds apt paths", () => {
    expect(paths.nodeAptUpdate("pve")).toBe("/nodes/pve/apt/update");
    expect(paths.nodeAptVersions("pve")).toBe("/nodes/pve/apt/versions");
    expect(paths.nodeAptRepos("pve")).toBe("/nodes/pve/repositories");
  });

  it("builds system config paths", () => {
    expect(paths.nodeDns("pve")).toBe("/nodes/pve/dns");
    expect(paths.nodeHosts("pve")).toBe("/nodes/pve/hosts");
    expect(paths.nodeTime("pve")).toBe("/nodes/pve/time");
    expect(paths.nodeTimezone("pve")).toBe("/nodes/pve/time/timezone");
    expect(paths.nodeConfig("pve")).toBe("/nodes/pve/config");
    expect(paths.nodeReport("pve")).toBe("/nodes/pve/report");
    expect(paths.nodeWakeOnLan("pve")).toBe("/nodes/pve/wakeonlan");
  });

  it("builds bulk action paths", () => {
    expect(paths.nodeStartAll("pve")).toBe("/nodes/pve/startall");
    expect(paths.nodeStopAll("pve")).toBe("/nodes/pve/stopall");
    expect(paths.nodeMigrateAll("pve")).toBe("/nodes/pve/migrateall");
  });

  it("builds subscription paths", () => {
    expect(paths.nodeSubscription("pve")).toBe("/nodes/pve/subscription");
  });

  it("builds service paths", () => {
    expect(paths.nodeServices("pve")).toBe("/nodes/pve/services");
    expect(paths.nodeService("pve", "pveproxy")).toBe("/nodes/pve/services/pveproxy");
  });

  it("builds network paths", () => {
    expect(paths.nodeNetwork("pve")).toBe("/nodes/pve/network");
    expect(paths.nodeIface("pve", "vmbr1")).toBe("/nodes/pve/network/vmbr1");
  });

  it("builds disk paths", () => {
    expect(paths.nodeDisks("pve")).toBe("/nodes/pve/disks");
    expect(paths.nodeDisksList("pve")).toBe("/nodes/pve/disks/list");
    expect(paths.nodeDiskInit("pve", "/dev/sdb")).toBe(
      "/nodes/pve/disks/init?disk=%2Fdev%2Fsdb",
    );
    expect(paths.nodeDiskWipe("pve", "/dev/sdb")).toBe(
      "/nodes/pve/disks/wipedisk?disk=%2Fdev%2Fsdb",
    );
    expect(paths.nodeDiskZfs("pve")).toBe("/nodes/pve/disks/zfs");
  });

  it("builds certificate paths", () => {
    expect(paths.nodeCert("pve")).toBe("/nodes/pve/certificates");
  });
});

describe("path helpers — Phase 2D Storage admin", () => {
  it("builds storage admin paths", () => {
    expect(paths.storageCreate()).toBe("/storage");
    expect(paths.storageUpdate("local-lvm")).toBe("/storage/local-lvm");
  });
});