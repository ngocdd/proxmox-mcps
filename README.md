<p align="center">
  <h1 align="center">proxmox-mcps</h1>
  <p align="center">
    <strong>MCP server for Proxmox VE — let your AI assistant run the cluster.</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/proxmox-mcps"><img src="https://img.shields.io/npm/v/proxmox-mcps" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/github/license/ngocdd/proxmox-mcps" alt="License: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="Node >=20"></a>
    <a href="https://github.com/ngocdd/proxmox-mcps/actions"><img src="https://img.shields.io/badge/tests-179%20passing-brightgreen" alt="Tests"></a>
    <a href="https://github.com/ngocdd/proxmox-mcps/releases"><img src="https://img.shields.io/github/v/release/ngocdd/proxmox-mcps" alt="GitHub release"></a>
  </p>
</p>

A Model Context Protocol server that exposes your [Proxmox VE](https://www.proxmox.com/en/proxmox-ve) cluster to AI assistants (Claude Code, Cursor, Windsurf, …). VMs, containers, storage, network, HA, replication, SDN, node admin — **195 tools** over stdio, HTTP+SSE, or streamable HTTP.

User-confirmation gates every destructive call. No silent deletes.

---

## Why

Proxmox has no first-class AI surface. Existing bridges are usually a thin wrapper around one or two endpoints. This server exposes the entire Proxmox API surface — VMs and containers, lifecycle, diagnostics, console access, replication, SDN, HA, cluster jobs, node admin — and wraps every destructive call behind an explicit yes/no prompt the model has to relay to you.

- **195 tools** across 9 functional areas (see [Tool catalog](#tool-catalog))
- **3 transports** — stdio for Claude Code, streamable HTTP for remote clients, SSE legacy
- **Approval-gated destructive ops** — `delete_vm`, `wipe_node_disk`, `apply_sdn`, … wait for you to type `yes`
- **SSRF guard** for server-side downloads (URL allowlist, RFC1918 / loopback rejection)
- **Pluggable job store** — in-memory (default) or SQLite for tracking long-running operations across restarts
- **QEMU guest agent** — exec inside the guest, fstrim, fsinfo, hostname, OS info, users, network
- **SSH-backed `execute_container_command`** — runs `pct exec` on the host to drop into a container

## Install

### From npm

```bash
# One-off run (always picks the latest published version)
npx proxmox-mcps

# Or install globally
npm install -g proxmox-mcps
proxmox-mcps
```

The package ships three binaries:

| Binary                            | Purpose                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| `proxmox-mcps`                    | MCP server (the thing you wire into Claude Code / your client)      |
| `proxmox-mcps-check-config`       | Validate `.env` / env vars without starting the server               |
| `proxmox-mcps-print-tools`        | Print every registered tool (or just the destructive ones)          |

### From source

```bash
git clone https://github.com/ngocdd/proxmox-mcps.git
cd proxmox-mcps
npm install
cp .env.example .env       # then fill in host + API token
npm run check-config       # validates your env without starting the server
npm run build              # tsc → dist/
npm start                  # node dist/index.js
```

## Configure

### 1. Get a Proxmox API token

Proxmox UI → **Datacenter → Permissions → API Tokens → Add**

- User: `root@pam`
- Token ID: `mcp`
- **Uncheck** "Privilege Separation" (so the token inherits the user's full privileges)
- Copy the generated UUID — that goes into `PROXMOX_TOKEN_VALUE`

### 2. Wire it into Claude Code

Install at user scope so the same `proxmox` server follows you across every project:

```bash
claude mcp add proxmox --scope user \
  -e PROXMOX_HOST=proxmox.example.com \
  -e PROXMOX_PORT=8006 \
  -e PROXMOX_USER=root@pam \
  -e PROXMOX_TOKEN_NAME=mcp \
  -e PROXMOX_TOKEN_VALUE=<uuid> \
  -e PROXMOX_VERIFY_SSL=false \
  -e PROXMOX_DEV_MODE=true \
  -- npx -y proxmox-mcps
```

> `--scope user` writes to `~/.claude.json` (or `~/.config/claude/` on Linux). Use `--scope project` to commit a `.mcp.json` entry, or `--scope local` for a one-off project-only entry.

Restart Claude Code. Verify with `/mcp` — you should see `proxmox` with **195 tools**.

Inspect or remove later:

```bash
claude mcp list                # show all configured servers
claude mcp get proxmox         # show env vars + command
claude mcp remove proxmox      # delete the entry
```

A drop-in `.mcp.json` snippet is in [`.mcp.json.example`](.mcp.json.example).

### 3. Or use any other MCP client

The server speaks the standard MCP protocol over three transports. Pick one via `MCP_TRANSPORT`:

| Transport     | When to use                                              |
| ------------- | -------------------------------------------------------- |
| `STDIO`       | Default. Local clients (Claude Code, Cursor, Windsurf)   |
| `STREAMABLE`  | Remote clients, modern MCP-over-HTTP                    |
| `SSE`         | Legacy SSE-only clients                                  |

For `STREAMABLE` / `SSE` the server listens on `MCP_HOST:MCP_PORT` and exposes `/mcp` (JSON-RPC) plus `/health`.

## Tool catalog

195 tools, grouped by surface. Run `proxmox-mcps-print-tools` for the canonical list with risk classifications.

| Group               | Count | Highlights                                                                                                                  |
| ------------------- | :---: | --------------------------------------------------------------------------------------------------------------------------- |
| **Cluster status**  |   1   | `get_cluster_status`                                                                                                       |
| **Pools**           |   5   | CRUD + `get_pool`                                                                                                          |
| **HA**              |  11   | Resources + groups + migrate-on-fail                                                                                       |
| **VM (QEMU)**       |  43   | Lifecycle, config, diagnostics, console (VNC/SPICE/termproxy/monitor), migration, **12 QEMU guest-agent tools**           |
| **Container (LXC)** |  27   | Lifecycle, config, diagnostics, **SSH-backed `execute_container_command`**, console, migration                              |
| **Snapshots**       |   4   | `list/create/delete/rollback_snapshot`                                                                                     |
| **Backups**         |  13   | On-demand + scheduled (vzdump) jobs + restore + prune                                                                      |
| **ISO / templates** |   4   | List / download / delete (URL-guarded)                                                                                     |
| **Tasks & jobs**    |   8   | Proxmox task log + long-running MCP job tracking                                                                           |
| **Storage**         |   5   | list / get / create / update / delete (lvm, zfs, nfs, cifs, pbs, dir, …)                                                   |
| **Replication**     |   7   | ZFS replication jobs CRUD + status                                                                                          |
| **SDN**             |  21   | Controllers / zones / vnets / subnets + `apply_sdn`                                                                        |
| **Node admin**      |  46   | apt · DNS · hosts · time · config · journal · syslog · pvereport · systemd services · network (bonds/bridges/VLANs/OVS) · disks + ZFS · bulk start/stop/migrate · subscription · certificates |

Risk profile (auto-discovered by `print-tools`):

| Risk          | Count | Behaviour                                                                  |
| ------------- | :---: | -------------------------------------------------------------------------- |
| `low`         |  79   | Runs immediately. Read-only / inspection tools.                           |
| `medium`      |  72   | Runs immediately. State-changing but recoverable.                         |
| `high`        |  19   | **Confirmation prompt** (returns a yes/no request to the model).          |
| `destructive` |  25   | **Confirmation prompt** + irreversible — extra warning.                   |

Audit-only logging for medium-risk tools is independent of the destructive gate. See [Safety model](#safety-model).

## Safety model

### Destructive & high-risk tools

Any tool classified `high` or `destructive` does **not** run immediately. The server returns a confirmation prompt that the model must show you:

```
⚠️  Confirmation required: 'delete_vm' is DESTRUCTIVE and cannot be undone.
Target: node=pve, vmid=100
Ask the user to reply 'yes' to proceed, or anything else to cancel.
If they confirm, re-invoke this tool with `confirm: true` added to the arguments.
```

You reply "yes", the model calls the same tool again with `confirm: true`, and the operation proceeds. Every destructive action is gated behind an explicit, visible human yes/no.

To skip the prompt for fully trusted automation:

```bash
PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE=true
```

Audit-only logging for medium-risk tools is independent:

```bash
PROXMOX_MCP_AUDIT_ONLY=true
```

Inspect the risk registry at any time:

```bash
proxmox-mcps-print-tools            # all 195 tools with risk levels
proxmox-mcps-print-tools destructive # only the 25 destructive ones
```

### SSRF guard for server-side downloads

`download_iso` (and any future `*_from_url` tool) hands the URL to Proxmox, which fetches it server-side. Before that happens, the URL is checked:

- **Schemes** must be in `PROXMOX_DOWNLOAD_ALLOWED_SCHEMES` (default: `http,https`).
- **Hosts** are resolved and rejected if they fall in RFC1918, RFC4193, loopback, link-local, CGNAT, multicast, or any other reserved range. The Proxmox host cannot be turned into an SSRF proxy against your internal network.
- An optional operator allowlist (`PROXMOX_DOWNLOAD_ALLOWED_HOSTS`) supports suffix (`.corp.example`), bare-IP, or CIDR matches.

See [`.env.example`](.env.example) for the full reference.

### VM config allowlist

`update_vm_config` rejects keys that can attach host PCI/USB devices, override SMBIOS, or change the QEMU machine type — see `src/safety/vm-config-allowlist.ts`.

## Environment reference

All variables can be passed inline, in `.env`, or as MCP server env vars. See [`.env.example`](.env.example) for the canonical list with defaults.

| Var                                     | Required | Default                  | Purpose                                                            |
| --------------------------------------- | :------: | ------------------------ | ------------------------------------------------------------------ |
| `PROXMOX_HOST`                          |    ✅    | —                        | Proxmox API hostname / IP                                          |
| `PROXMOX_PORT`                          |          | `8006`                   | Proxmox API port                                                   |
| `PROXMOX_USER`                          |    ✅    | —                        | API user (`user@realm`)                                            |
| `PROXMOX_TOKEN_NAME`                    |    ✅    | —                        | Token ID                                                           |
| `PROXMOX_TOKEN_VALUE`                   |    ✅    | —                        | Token secret UUID                                                  |
| `PROXMOX_VERIFY_SSL`                    |          | `true`                   | Set `false` only with self-signed certs                            |
| `PROXMOX_TIMEOUT_MS`                    |          | `30000`                  | Per-request timeout                                                |
| `PROXMOX_SERVICE`                       |          | `PVE`                    | `PVE` / `PMG` / `PBS`                                              |
| `PROXMOX_DEV_MODE`                      |          | `false`                  | Required when `PROXMOX_VERIFY_SSL=false`                           |
| `PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE` |          | `false`                  | Skip confirmation prompts for high/destructive tools               |
| `PROXMOX_MCP_AUDIT_ONLY`                |          | `false`                  | Audit-log every medium-risk call                                   |
| `LOG_LEVEL`                             |          | `info`                   | `debug` / `info` / `warn` / `error`                                |
| `LOG_PRETTY`                            |          | `false`                  | Use pino-pretty (dev only)                                         |
| `PROXMOX_MCP_RETRY_MAX`                |          | `3`                      | Retries on transient API errors                                    |
| `PROXMOX_MCP_RETRY_BASE_MS`            |          | `200`                    | Retry backoff base                                                 |
| `PROXMOX_MCP_JOB_TTL_HOURS`            |          | `24`                     | Long-running job retention                                         |
| `PROXMOX_MCP_JOB_STORE`                |          | `memory`                 | `memory` or `sqlite`                                               |
| `PROXMOX_MCP_JOB_SQLITE_PATH`          |          | `./proxmox-jobs.sqlite3` | SQLite job store path                                              |
| `MCP_TRANSPORT`                         |          | `STDIO`                  | `STDIO` / `SSE` / `STREAMABLE`                                     |
| `MCP_HOST`                              |          | `127.0.0.1`              | HTTP bind address                                                  |
| `MCP_PORT`                              |          | `8000`                   | HTTP listen port                                                   |
| `PROXMOX_SSH_USER`                      |          | `root`                   | SSH user for `pct exec`                                            |
| `PROXMOX_SSH_PORT`                      |          | `22`                     | SSH port                                                           |
| `PROXMOX_SSH_KEY_FILE`                  |          | —                        | Path to SSH private key                                            |
| `PROXMOX_SSH_PASSWORD`                  |          | —                        | SSH password (prefer key)                                          |
| `PROXMOX_SSH_HOST_OVERRIDES`            |          | —                        | JSON map of `node → ssh host`                                      |
| `PROXMOX_SSH_KNOWN_HOSTS_FILE`          |          | —                        | Path to `known_hosts`                                              |
| `PROXMOX_SSH_STRICT_HOST_KEY_CHECKING` |          | `true`                   | Reject unknown host keys                                           |
| `PROXMOX_DOWNLOAD_ALLOWED_SCHEMES`      |          | `http,https`             | URL schemes for `download_iso`                                     |
| `PROXMOX_DOWNLOAD_ALLOWED_HOSTS`        |          | —                        | Optional allowlist (suffix / IP / CIDR)                            |

> `PROXMOX_VERIFY_SSL=false` requires `PROXMOX_DEV_MODE=true` — the server refuses to start otherwise.

## Development

```bash
git clone https://github.com/ngocdd/proxmox-mcps.git
cd proxmox-mcps
npm install
npm run dev               # tsx watch mode
npm run build             # tsc → dist/
npm test                  # 179 unit tests
npm run lint              # eslint
npm run format:check      # prettier
```

### Updating dependencies

```bash
npm outdated              # see available updates
npm update                # safe patch + minor bumps
npm audit                 # known CVEs
npm audit fix             # safe security fixes
```

Native deps (`better-sqlite3`, `ssh2`, …) need install scripts. The repo's [`.npmrc`](.npmrc) carries the npm 11+ allowlist. If you add a new native dep, append its name to `allow-scripts[]` there.

### Releasing

1. Bump `version` in `package.json`.
2. `npm test && npm run build`.
3. `git tag v<version> && git push --tags`.
4. `npm publish`.

## Project layout

```
src/
  index.ts                entry point (stdio / streamable / sse)
  server.ts               MCP server factory
  config/                 env schema (zod) + typed config
  format/                 response formatters
  jobs/                   long-running job tracking (memory + sqlite)
  log.ts                  pino logger
  proxmox/                API client + path helpers
  safety/                 risk registry + approval policy + URL guard
  security/               auth + secret redaction
  ssh/                    SSH client for pct exec
  tools/                  one file per tool group
    vm/                   crud, config, diagnostics, migration, console
    container/            crud, config, diagnostics, migration, console
    cluster, node, storage, tasks, jobs,
    snapshot, backup, backup-schedule, iso,
    pools, ha, replication, sdn,
    node-admin, node-services, node-network, node-disks, node-certs,
    storage-admin
  cli/                    check-config, print-tools
tests/
  unit/                   vitest unit suite (179 tests)
  integration/            end-to-end (gated by PROXMOX_E2E=1)
```

## Security

- Destructive calls require an explicit `confirm: true` from the model after a user-typed "yes".
- URL guard rejects private/loopback hosts for server-side downloads.
- VM config allowlist blocks keys that can attach host devices or change machine type.
- Logs redact token UUIDs and SSH passwords.

Found a vulnerability? Please email `ngocdd94@gmail.com` rather than filing a public issue.

## Contributing

Issues and PRs welcome. For anything beyond a typo:

1. Open an issue first describing the change.
2. New tools must register a risk level in `src/safety/risk.ts` (`low` / `medium` / `high` / `destructive`).
3. New env vars must be added to both `src/config/env.ts` (zod schema) and `.env.example`.
4. Run `npm test && npm run lint && npm run build` before opening the PR.

## Acknowledgments

- Built on [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).
- The Proxmox API client uses [`axios`](https://github.com/axios/axios) with [`p-retry`](https://github.com/sindresorhus/p-retry) for transient errors.
- Long-running job tracking uses [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) when persistence is enabled.
- Container command execution uses [`ssh2`](https://github.com/mscdex/ssh2) to shell out to `pct exec` on the host.

## License

[MIT](./LICENSE) © Proxmox MCP Contributors