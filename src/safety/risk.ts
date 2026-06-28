/**
 * Risk classification registry.
 *
 * Importing this file has the side effect of registering every known tool
 * name with its risk level. Tools added in later phases extend this map; the
 * policy gate (`policy.ts`) reads it to decide whether a call needs a user
 * confirmation prompt (high / destructive) or just an audit log (medium).
 */
import { registerRisk, type Risk } from "./policy.js";

const RISK_TABLE: Record<string, Risk> = {
  // ---- Foundation ---------------------------------------------------------
  get_cluster_status: "low",
  get_nodes: "low",
  get_node_status: "low",
  get_node_syslog: "low",
  get_node_journal: "low",
  get_storage: "low",
  list_tasks: "low",
  get_task: "low",
  get_task_log: "low",
  list_jobs: "low",
  get_job: "low",
  poll_job: "low",
  cancel_job: "medium",
  retry_job: "medium",

  // ---- Snapshots ----------------------------------------------------------
  list_snapshots: "low",
  create_snapshot: "medium",
  delete_snapshot: "destructive",
  rollback_snapshot: "destructive",

  // ---- Backup -------------------------------------------------------------
  list_backups: "low",
  create_backup: "medium",
  restore_backup: "destructive",
  delete_backup: "destructive",
  prune_backups: "medium",

  // ---- ISO / Templates ----------------------------------------------------
  list_isos: "low",
  list_templates: "low",
  download_iso: "medium",
  delete_iso: "destructive",

  // ---- VM CRUD & lifecycle -----------------------------------------------
  get_vms: "low",
  get_vm_config: "low",
  get_vm_status: "low",
  create_vm: "medium",
  clone_vm: "medium",
  start_vm: "medium",
  stop_vm: "medium",
  shutdown_vm: "medium",
  reset_vm: "medium",
  reboot_vm: "medium",
  delete_vm: "destructive",

  // ---- VM Config & cloud-init --------------------------------------------
  update_vm_config: "high",
  resize_vm_disk: "medium",
  regenerate_vm_config: "medium",
  set_vm_cloudinit: "medium",
  get_vm_pending: "low",

  // ---- VM Diagnostics ----------------------------------------------------
  get_vm_rrd: "low",
  get_vm_rrddata: "low",
  vm_agent_info: "low",
  vm_agent_get_hostname: "low",
  vm_agent_get_osinfo: "low",
  vm_agent_get_users: "low",
  vm_agent_get_network_interfaces: "low",
  vm_agent_get_vcpus: "low",
  vm_agent_get_time: "low",
  vm_agent_get_fsinfo: "low",
  vm_agent_fstrim: "medium",
  vm_agent_exec: "high",
  vm_agent_exec_status: "low",
  vm_agent_set_user_password: "high",
  vm_sendkey: "medium",
  vm_monitor: "high",
  vm_firewall_rules: "low",
  vm_firewall_options: "low",

  // ---- VM Migration & storage --------------------------------------------
  migrate_vm: "medium",
  move_vm_disk: "medium",
  convert_vm_to_template: "destructive",
  unlink_vm_disk: "medium",

  // ---- VM Console --------------------------------------------------------
  vm_vncproxy: "medium",
  vm_termproxy: "medium",
  vm_spiceproxy: "medium",
  vm_mtunnel: "medium",
  vm_mtunnelwebsocket: "medium",
  vm_feature: "medium",

  // ---- Container CRUD & lifecycle ----------------------------------------
  get_containers: "low",
  get_container_config: "low",
  get_container_status: "low",
  get_container_ip: "low",
  create_container: "medium",
  clone_container: "medium",
  start_container: "medium",
  stop_container: "medium",
  shutdown_container: "medium",
  restart_container: "medium",
  delete_container: "destructive",
  update_container_resources: "medium",

  // ---- Container Config --------------------------------------------------
  update_container_config: "medium",
  resize_container_disk: "medium",
  move_container_volume: "medium",

  // ---- Container Diagnostics ---------------------------------------------
  get_container_rrd: "low",
  get_container_rrddata: "low",
  container_firewall_rules: "low",
  container_firewall_options: "low",
  execute_container_command: "medium",

  // ---- Container Migration & storage -------------------------------------
  migrate_container: "medium",
  move_container_disk: "medium",
  convert_container_to_template: "destructive",
  unlink_container_disk: "medium",

  // ---- Container Console -------------------------------------------------
  container_vncproxy: "medium",
  container_termproxy: "medium",
  container_spiceproxy: "medium",

  // ---- Pools (Phase 2B) --------------------------------------------------
  list_pools: "low",
  get_pool: "low",
  create_pool: "medium",
  update_pool: "medium",
  delete_pool: "destructive",

  // ---- Cluster HA (Phase 2B) ---------------------------------------------
  list_ha_resources: "low",
  get_ha_resource_status: "low",
  add_ha_resource: "high",
  remove_ha_resource: "destructive",
  migrate_ha_resource: "medium",
  list_ha_groups: "low",
  get_ha_group: "low",
  create_ha_group: "high",
  update_ha_group: "high",
  delete_ha_group: "destructive",
  get_ha_status: "low",

  // ---- Cluster Backup Schedule (Phase 2B) --------------------------------
  list_backup_jobs: "low",
  get_backup_job: "low",
  create_backup_job: "medium",
  update_backup_job: "medium",
  delete_backup_job: "destructive",
  run_backup_job: "medium",
  get_backup_job_included: "low",

  // ---- Replication (Phase 2D) ---------------------------------------------
  list_replication_jobs: "low",
  get_replication_job: "low",
  get_replication_status: "low",
  create_replication_job: "medium",
  update_replication_job: "medium",
  delete_replication_job: "destructive",
  list_node_replication: "low",

  // ---- SDN (Phase 2D) -----------------------------------------------------
  list_sdn_controllers: "low",
  get_sdn_controller: "low",
  create_sdn_controller: "high",
  update_sdn_controller: "high",
  delete_sdn_controller: "destructive",
  list_sdn_vnets: "low",
  get_sdn_vnet: "low",
  create_sdn_vnet: "medium",
  update_sdn_vnet: "medium",
  delete_sdn_vnet: "destructive",
  list_sdn_zones: "low",
  get_sdn_zone: "low",
  create_sdn_zone: "high",
  update_sdn_zone: "high",
  delete_sdn_zone: "destructive",
  list_sdn_subnets: "low",
  get_sdn_subnet: "low",
  create_sdn_subnet: "medium",
  update_sdn_subnet: "medium",
  delete_sdn_subnet: "destructive",
  apply_sdn: "destructive",

  // ---- Node admin (Phase 2C) ---------------------------------------------
  node_apt_update: "medium",
  node_apt_versions: "low",
  node_apt_repos_list: "low",
  node_apt_repos_change: "high",
  get_node_dns: "low",
  set_node_dns: "medium",
  get_node_hosts: "low",
  set_node_hosts: "medium",
  get_node_time: "low",
  set_node_time: "medium",
  get_node_timezone: "low",
  set_node_timezone: "medium",
  get_node_config: "low",
  update_node_config: "high",
  get_node_report: "low",
  node_start_all: "medium",
  node_stop_all: "medium",
  node_migrate_all: "medium",
  node_wake_on_lan: "low",
  get_node_subscription: "low",
  set_node_subscription: "high",
  update_node_subscription: "high",
  delete_node_subscription: "medium",

  list_node_services: "low",
  node_service_start: "medium",
  node_service_stop: "medium",
  node_service_restart: "medium",
  node_service_reload: "medium",
  node_service_enable: "medium",
  node_service_disable: "medium",

  list_node_network: "low",
  create_node_network: "high",
  update_node_network: "high",
  delete_node_network: "destructive",
  reload_node_network: "medium",

  list_node_disks: "low",
  list_node_disks_detailed: "low",
  init_node_disk: "destructive",
  wipe_node_disk: "destructive",
  create_node_zfs: "destructive",

  list_node_certificates: "low",
  delete_node_certificate: "destructive",

  // ---- Storage admin (Phase 2D) ------------------------------------------
  list_storages: "low",
  create_storage: "high",
  update_storage: "high",
  delete_storage: "destructive",
};

/** Bulk-register every entry above. Called once at module load. */
export function registerAllRisk(): void {
  for (const [name, risk] of Object.entries(RISK_TABLE)) {
    registerRisk(name, risk);
  }
}

registerAllRisk();