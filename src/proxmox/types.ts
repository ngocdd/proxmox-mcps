/**
 * Response shapes returned by Proxmox API.
 *
 * Proxmox wraps every successful response in `{ data: ... }`. The actual
 * content varies wildly per endpoint, so we keep these types loose (`unknown`
 * for the body) and let tools narrow as needed.
 */

/** Standard Proxmox API envelope. */
export interface ProxmoxResponse<T = unknown> {
  data: T;
}

/** Error envelope: errors keyed by form field. */
export interface ProxmoxErrorResponse {
  errors?: Record<string, string>;
  data?: unknown;
  message?: string;
}

// ---- Cluster & node ------------------------------------------------------

export interface ClusterNodeInfo {
  type: string;
  id?: string;
  name?: string;
  ip?: string;
  level?: string;
  local?: boolean;
  nodeid?: number;
  online?: boolean;
  quorate?: number;
}

export interface ClusterStatus {
  name?: string;
  quorate?: number;
  id?: string;
  version?: number;
  nodes?: ClusterNodeInfo[];
}

export interface NodeStatus {
  node: string;
  status: "online" | "offline" | "unknown";
  cpu?: number;
  level?: string;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  uptime?: number;
  id?: string;
  ip?: string;
  storage?: number;
  maxstorage?: number;
}

export interface ResourceListItem {
  id: string;
  type: "vm" | "node" | "storage" | "pool" | "sdn";
  node?: string;
  vmid?: number;
  name?: string;
  status?: string;
  template?: number;
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  pool?: string;
}

// ---- VM ------------------------------------------------------------------

export interface VmConfig {
  name?: string;
  cores?: number;
  sockets?: number;
  memory?: number;
  ostype?: string;
  scsi0?: string;
  scsihw?: string;
  net0?: string;
  boot?: string;
  cpu?: string;
  bios?: string;
  machine?: string;
  description?: string;
  template?: number;
  agent?: string;
  [key: string]: unknown;
}

export interface VmStatus {
  status: "running" | "stopped" | "paused";
  vmid: number;
  name?: string;
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  template?: number;
  pid?: number;
  qmpstatus?: string;
  running_machine?: string;
  running_qemu?: string;
}

export interface VmAgentExecResult {
  pid: number;
  exited?: number;
  exitcode?: number;
  signal?: number;
  outData?: string; // base64-encoded
  errData?: string; // base64-encoded
}

export interface VmRrdPoint {
  time: number;
  cpu?: number;
  mem?: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
  [key: string]: number | undefined;
}

export interface VncTicket {
  port: number;
  ticket: string;
  cert?: string;
  upid?: string;
}

export interface SpiceTicket extends VncTicket {
  type: "spice";
}

// ---- LXC -----------------------------------------------------------------

export interface LxcConfig {
  hostname?: string;
  cores?: number;
  memory?: number;
  swap?: number;
  rootfs?: string;
  net0?: string;
  ostype?: string;
  arch?: string;
  features?: string;
  description?: string;
  template?: number;
  onboot?: number;
  unprivileged?: number;
  [key: string]: unknown;
}

export interface LxcStatus {
  status: "running" | "stopped";
  vmid: number;
  name?: string;
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  swap?: number;
  maxswap?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  template?: number;
  pid?: number;
}

export interface LxcInterface {
  name: string;
  ip_addresses?: Array<{
    ip_address: string;
    prefix: number;
    family: string;
  }>;
  mac_address?: string;
  stats?: Record<string, number>;
}

// ---- Snapshots & backups -------------------------------------------------

export interface SnapshotInfo {
  name: string;
  description?: string;
  snaptime?: number;
  parent?: string;
  vmstate?: number;
  [key: string]: unknown;
}

export interface BackupEntry {
  volid: string;
  format: string;
  size: number;
  ctime: number;
  vmid?: number;
  notes?: string;
  protected?: boolean;
  [key: string]: unknown;
}

export interface IsoEntry {
  volid: string;
  format: string;
  size: number;
  ctime: number;
  [key: string]: unknown;
}

export interface TemplateEntry {
  volid: string;
  format: string;
  size: number;
  ctime: number;
  [key: string]: unknown;
}

// ---- Tasks ---------------------------------------------------------------

export interface TaskStatus {
  upid: string;
  node: string;
  pid: number;
  pstart: number;
  starttime: number;
  type: string;
  user: string;
  status: "running" | "stopped" | "OK" | "WARNINGS" | "ERROR" | "unknown";
  exitstatus?: string;
  endtime?: number;
}

export interface TaskLogLine {
  n: number;
  t: string;
}

// ---- Storage -------------------------------------------------------------

export interface StorageInfo {
  storage: string;
  type: string;
  content?: string;
  path?: string;
  shared?: number;
  total?: number;
  used?: number;
  available?: number;
  active?: number;
  enabled?: number;
}

// ---- Firewall ------------------------------------------------------------

export interface FirewallRule {
  pos: number;
  type: "in" | "out" | "group";
  action: "ACCEPT" | "DROP" | "REJECT";
  enable?: number;
  source?: string;
  dest?: string;
  proto?: string;
  dport?: string;
  sport?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface FirewallOptions {
  enable?: number;
  dhcp?: number;
  ndp?: number;
  macfilter?: number;
  ipfilter?: number;
  radv?: number;
  log_level_in?: string;
  log_level_out?: string;
  [key: string]: unknown;
}