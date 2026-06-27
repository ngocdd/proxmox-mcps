# Proxmox MCP (TypeScript)

MCP server for [Proxmox VE](https://www.proxmox.com/en/proxmox-ve) — lets AI assistants (Claude Code, etc.) manage QEMU VMs, LXC containers, storage, network, HA, replication, SDN, and node admin.

**195 tools** · 3 transports (stdio / HTTP-SSE / streamable) · approval-gated destructive ops

## Supported tools (195)

**Foundation (24)** — `get_cluster_status`, `get_nodes`, `get_node_status`, `get_storage`, `list_tasks`, `get_task`, `get_task_log`, `list_jobs`, `get_job`, `poll_job`, `cancel_job`, `retry_job` · snapshot / backup / ISO + template CRUD

**VM (45)** — CRUD + lifecycle (`get_vms`, `get_vm_config`, `create_vm`, `clone_vm`, `start/stop/shutdown/reset/reboot/delete_vm`) · config (`update_vm_config`, `resize_vm_disk`, `set_vm_cloudinit`) · diagnostics (RRD, 10× QEMU guest agent, `vm_monitor`, `vm_firewall_rules`) · migration + console (VNC / SPICE / termproxy)

**Container (35)** — CRUD + lifecycle + config (`update_container_resources`, `resize_container_disk`) · diagnostics (RRD, firewall, **`execute_container_command`** via SSH + `pct exec`) · migration + console

**Cluster (23)** — Resource pools (5) · HA resources + groups (11) · Scheduled vzdump jobs (7)

**Node admin (40)** — apt / DNS / hosts / time (15) · bulk ops (4) · subscription (4) · systemd services (7) · network bonds/bridges/VLANs/OVS (5) · disks + ZFS (5) · certificates (2)

**Storage (5)** — `list_storages`, `get_storage`, `create/update/delete_storage` (lvm, zfs, nfs, cifs, pbs, dir, …)

**Replication (7)** + **SDN (22)** — ZFS replication jobs · SDN controllers / zones / vnets / subnets + `apply_sdn`

> 25 destructive tools require an approval token (or `PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE=true`). List them: `proxmox-mcp-print-tools destructive`.

## Install

### From npm (recommended)

```bash
npx proxmox-mcps
# or install globally
npm install -g proxmox-mcps
proxmox-mcp          # CLI binary (installed by the package above)
```

### From source

```bash
git clone https://github.com/your-username/proxmox-mcp.git
cd proxmox-mcp
npm install
cp .env.example .env       # fill in Proxmox host + API token
npm run check-config       # validate env
npm run build              # tsc → dist/
npm start                  # node dist/index.js
```

## Configure for Claude Code

```bash
claude mcp add proxmox \
  --command "npx" --args "-y,proxmox-mcps" \
  --env "PROXMOX_HOST=proxmox.example.com" \
  --env "PROXMOX_PORT=8006" \
  --env "PROXMOX_USER=root@pam" \
  --env "PROXMOX_TOKEN_NAME=mcp" \
  --env "PROXMOX_TOKEN_VALUE=<uuid>" \
  --env "PROXMOX_VERIFY_SSL=false" \
  --env "PROXMOX_DEV_MODE=true"
```

Restart Claude Code, verify with `/mcp` (should show `proxmox` with 195 tools).

### Get an API token

Proxmox UI → **Datacenter → Permissions → API Tokens → Add** → user `root@pam`, token ID `mcp`, uncheck **Privilege Separation** → copy the secret UUID into `PROXMOX_TOKEN_VALUE`.

Full env-var reference: [`.env.example`](.env.example).

## License

MIT