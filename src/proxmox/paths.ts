/**
 * URL path builders. Single source of truth for Proxmox API paths.
 *
 * Each function returns a string ready for the client to GET/POST/PUT/DELETE.
 * Path parameters are typed to catch typos at compile time.
 */

// ---- Cluster & nodes -----------------------------------------------------

export const clusterStatus = (): string => "/cluster/status";
export const clusterResources = (type?: "vm" | "node" | "storage"): string =>
  type ? `/cluster/resources?type=${type}` : "/cluster/resources";
export const nodes = (): string => "/nodes";
export const nodeStatus = (node: string): string => `/nodes/${node}/status`;
export const nodeSyslog = (node: string, limit?: number): string => {
  const q = limit ? `?limit=${limit}` : "";
  return `/nodes/${node}/syslog${q}`;
};
export const nodeJournal = (node: string, limit?: number): string => {
  const q = limit ? `?limit=${limit}` : "";
  return `/nodes/${node}/journal${q}`;
};

// ---- Storage -------------------------------------------------------------

export const storage = (): string => "/storage";
export const nodeStorageStatus = (node: string, storage: string): string =>
  `/nodes/${node}/storage/${storage}/status`;
export const nodeStorageContent = (
  node: string,
  storage: string,
  content: "iso" | "vztmpl" | "backup",
): string => `/nodes/${node}/storage/${storage}/content?content=${content}`;
export const storageDownloadUrl = (node: string, storage: string): string =>
  `/nodes/${node}/storage/${storage}/download-url`;
export const storageContent = (node: string, storage: string, volume: string): string =>
  `/nodes/${node}/storage/${storage}/content/${volume}`;
export const pruneBackups = (storage: string): string => `/storage/${storage}/prune-backups`;

// ---- VM (QEMU) -----------------------------------------------------------

export const qemu = (node: string): string => `/nodes/${node}/qemu`;
export const qemuVm = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}`;
export const qemuConfig = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/config`;
export const qemuPending = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/pending`;
export const qemuStatus = (
  node: string,
  vmid: string | number,
  action: "current" | "start" | "stop" | "shutdown" | "reboot" | "reset" | "suspend" | "resume",
): string => `/nodes/${node}/qemu/${vmid}/status/${action}`;
export const qemuClone = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/clone`;
export const qemuResize = (node: string, vmid: string | number, disk: string): string =>
  `/nodes/${node}/qemu/${vmid}/resize?disk=${encodeURIComponent(disk)}`;
export const qemuMoveDisk = (node: string, vmid: string | number, disk: string): string =>
  `/nodes/${node}/qemu/${vmid}/move-disk?disk=${encodeURIComponent(disk)}`;
export const qemuUnlink = (node: string, vmid: string | number, disk: string): string =>
  `/nodes/${node}/qemu/${vmid}/unlink?disk=${encodeURIComponent(disk)}`;
export const qemuMigrate = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/migrate`;
export const qemuTemplate = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/template`;
export const qemuRrd = (
  node: string,
  vmid: string | number,
  timeframe: "hour" | "day" | "week" | "month" | "year",
): string => `/nodes/${node}/qemu/${vmid}/rrd?timeframe=${timeframe}`;
export const qemuRrdData = (
  node: string,
  vmid: string | number,
  timeframe: "hour" | "day" | "week" | "month" | "year",
): string => `/nodes/${node}/qemu/${vmid}/rrddata?timeframe=${timeframe}`;

// VM console
export const qemuVncProxy = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/vncproxy`;
export const qemuTermProxy = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/termproxy`;
export const qemuSpiceProxy = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/spiceproxy`;
export const qemuMtunnel = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/mtunnel`;
export const qemuMtunnelWebsocket = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/mtunnelwebsocket`;
export const qemuFeature = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/feature`;
export const qemuMonitor = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/monitor`;
export const qemuSendkey = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/sendkey`;

// VM agent
export const qemuAgent = (
  node: string,
  vmid: string | number,
  action:
    | "info"
    | "get-fsinfo"
    | "get-host-name"
    | "get-time"
    | "get-users"
    | "get-osinfo"
    | "get-vcpus"
    | "network-get-interfaces"
    | "fstrim"
    | "set-user-password"
    | "ping",
): string => `/nodes/${node}/qemu/${vmid}/agent/${action}`;
export const qemuAgentExec = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/agent/exec`;
export const qemuAgentExecStatus = (
  node: string,
  vmid: string | number,
  pid: string | number,
): string => `/nodes/${node}/qemu/${vmid}/agent/exec-status?pid=${pid}`;

// VM firewall
export const qemuFirewallRules = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/firewall/rules`;
export const qemuFirewallOptions = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/firewall/options`;
export const qemuCloudinit = (node: string, vmid: string | number): string =>
  `/nodes/${node}/qemu/${vmid}/cloudinit`;

// ---- LXC (Container) -----------------------------------------------------

export const lxc = (node: string): string => `/nodes/${node}/lxc`;
export const lxcCt = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}`;
export const lxcConfig = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/config`;
export const lxcPending = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/pending`;
export const lxcStatus = (
  node: string,
  vmid: string | number,
  action: "current" | "start" | "stop" | "shutdown" | "reboot",
): string => `/nodes/${node}/lxc/${vmid}/status/${action}`;
export const lxcClone = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/clone`;
export const lxcResize = (node: string, vmid: string | number, disk: string): string =>
  `/nodes/${node}/lxc/${vmid}/resize?disk=${encodeURIComponent(disk)}`;
export const lxcMoveDisk = (node: string, vmid: string | number, disk: string): string =>
  `/nodes/${node}/lxc/${vmid}/move-disk?disk=${encodeURIComponent(disk)}`;
export const lxcMoveVolume = (node: string, vmid: string | number, volume: string): string =>
  `/nodes/${node}/lxc/${vmid}/move-volume?volume=${encodeURIComponent(volume)}`;
export const lxcUnlink = (node: string, vmid: string | number, volume: string): string =>
  `/nodes/${node}/lxc/${vmid}/unlink?volume=${encodeURIComponent(volume)}`;
export const lxcMigrate = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/migrate`;
export const lxcTemplate = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/template`;
export const lxcRrd = (
  node: string,
  vmid: string | number,
  timeframe: "hour" | "day" | "week" | "month" | "year",
): string => `/nodes/${node}/lxc/${vmid}/rrd?timeframe=${timeframe}`;
export const lxcRrdData = (
  node: string,
  vmid: string | number,
  timeframe: "hour" | "day" | "week" | "month" | "year",
): string => `/nodes/${node}/lxc/${vmid}/rrddata?timeframe=${timeframe}`;
export const lxcInterfaces = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/interfaces`;

// LXC console
export const lxcVncProxy = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/vncproxy`;
export const lxcTermProxy = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/termproxy`;
export const lxcSpiceProxy = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/spiceproxy`;

// LXC firewall
export const lxcFirewallRules = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/firewall/rules`;
export const lxcFirewallOptions = (node: string, vmid: string | number): string =>
  `/nodes/${node}/lxc/${vmid}/firewall/options`;

// ---- Snapshots & backups --------------------------------------------------

export const snapshotList = (node: string, type: "qemu" | "lxc", vmid: string | number): string =>
  `/nodes/${node}/${type}/${vmid}/snapshot`;
export const snapshotCreate = (node: string, type: "qemu" | "lxc", vmid: string | number): string =>
  `/nodes/${node}/${type}/${vmid}/snapshot`;
export const snapshotDelete = (
  node: string,
  type: "qemu" | "lxc",
  vmid: string | number,
  snapname: string,
): string => `/nodes/${node}/${type}/${vmid}/snapshot/${encodeURIComponent(snapname)}`;
export const snapshotRollback = (
  node: string,
  type: "qemu" | "lxc",
  vmid: string | number,
  snapname: string,
): string => `/nodes/${node}/${type}/${vmid}/snapshot/${encodeURIComponent(snapname)}/rollback`;

export const vzdump = (node: string): string => `/nodes/${node}/vzdump`;

// ---- Tasks (UPIDs) -------------------------------------------------------

export const taskStatus = (node: string, upid: string): string =>
  `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`;
export const taskLog = (node: string, upid: string, limit?: number): string => {
  const q = limit ? `?limit=${limit}` : "";
  return `/nodes/${node}/tasks/${encodeURIComponent(upid)}/log${q}`;
};
export const taskStop = (node: string, upid: string): string =>
  `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status/stop`;
export const clusterTasks = (): string => "/cluster/tasks";

// ---- Pools ----------------------------------------------------------------

export const pools = (): string => "/pools";
export const pool = (poolid: string): string => `/pools/${encodeURIComponent(poolid)}`;

// ---- Cluster HA -----------------------------------------------------------

export const haResources = (): string => "/cluster/ha";
export const haResource = (sid: string): string => `/cluster/ha/${encodeURIComponent(sid)}`;
export const haResourceStatus = (sid: string): string =>
  `/cluster/ha/${encodeURIComponent(sid)}/status`;
export const haGroups = (): string => "/cluster/ha/groups";
export const haGroup = (group: string): string =>
  `/cluster/ha/groups/${encodeURIComponent(group)}`;
export const haStatus = (): string => "/cluster/ha/status";

// ---- Cluster Backup Schedule ----------------------------------------------

export const backupJobs = (): string => "/cluster/backup";
export const backupJob = (id: string): string => `/cluster/backup/${encodeURIComponent(id)}`;
export const runBackupJob = (id: string): string =>
  `/cluster/backup/${encodeURIComponent(id)}/run`;
export const backupJobIncluded = (id: string): string =>
  `/cluster/backup/${encodeURIComponent(id)}/included`;

// ---- Cluster Replication --------------------------------------------------

export const replication = (): string => "/cluster/replication";
export const replicationJob = (id: string): string =>
  `/cluster/replication/${encodeURIComponent(id)}`;
export const replicationStatus = (id: string): string =>
  `/cluster/replication/${encodeURIComponent(id)}/status`;
export const nodeReplication = (node: string): string => `/nodes/${node}/replication`;

// ---- Cluster SDN ----------------------------------------------------------

export const sdnControllers = (): string => "/cluster/sdn/controllers";
export const sdnController = (name: string): string =>
  `/cluster/sdn/controllers/${encodeURIComponent(name)}`;
export const sdnVnets = (): string => "/cluster/sdn/vnets";
export const sdnVnet = (name: string): string => `/cluster/sdn/vnets/${encodeURIComponent(name)}`;
export const sdnZones = (): string => "/cluster/sdn/zones";
export const sdnZone = (name: string): string => `/cluster/sdn/zones/${encodeURIComponent(name)}`;
export const sdnSubnets = (vnet: string): string =>
  `/cluster/sdn/vnets/${encodeURIComponent(vnet)}/subnets`;
export const sdnSubnet = (vnet: string, subnet: string): string =>
  `/cluster/sdn/vnets/${encodeURIComponent(vnet)}/subnets/${encodeURIComponent(subnet)}`;

// ---- Node admin (Phase 2C) ------------------------------------------------

export const nodeAptUpdate = (node: string): string => `/nodes/${node}/apt/update`;
export const nodeAptRepos = (node: string): string => `/nodes/${node}/repositories`;
export const nodeAptVersions = (node: string): string => `/nodes/${node}/apt/versions`;
export const nodeDns = (node: string): string => `/nodes/${node}/dns`;
export const nodeHosts = (node: string): string => `/nodes/${node}/hosts`;
export const nodeTime = (node: string): string => `/nodes/${node}/time`;
export const nodeTimezone = (node: string): string => `/nodes/${node}/time/timezone`;
export const nodeConfig = (node: string): string => `/nodes/${node}/config`;
export const nodeReport = (node: string): string => `/nodes/${node}/report`;
export const nodeStartAll = (node: string): string => `/nodes/${node}/startall`;
export const nodeStopAll = (node: string): string => `/nodes/${node}/stopall`;
export const nodeMigrateAll = (node: string): string => `/nodes/${node}/migrateall`;
export const nodeWakeOnLan = (node: string): string => `/nodes/${node}/wakeonlan`;
export const nodeSubscription = (node: string): string => `/nodes/${node}/subscription`;

// Node services
export const nodeServices = (node: string): string => `/nodes/${node}/services`;
export const nodeService = (node: string, service: string): string =>
  `/nodes/${node}/services/${encodeURIComponent(service)}`;

// Node network
export const nodeNetwork = (node: string): string => `/nodes/${node}/network`;
export const nodeIface = (node: string, iface: string): string =>
  `/nodes/${node}/network/${encodeURIComponent(iface)}`;

// Node disks
export const nodeDisks = (node: string): string => `/nodes/${node}/disks`;
export const nodeDisksList = (node: string): string => `/nodes/${node}/disks/list`;
export const nodeDiskInit = (node: string, disk: string): string =>
  `/nodes/${node}/disks/init?disk=${encodeURIComponent(disk)}`;
export const nodeDiskWipe = (node: string, disk: string): string =>
  `/nodes/${node}/disks/wipedisk?disk=${encodeURIComponent(disk)}`;
export const nodeDiskZfs = (node: string): string => `/nodes/${node}/disks/zfs`;
export const nodeDiskZfsCreate = (node: string): string => `/nodes/${node}/disks/zfs`;

// Node certificates
export const nodeCert = (node: string): string => `/nodes/${node}/certificates`;

// Storage admin (Phase 2D)
export const storageCreate = (): string => "/storage";
export const storageUpdate = (storage: string): string => `/storage/${encodeURIComponent(storage)}`;