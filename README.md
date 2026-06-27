# Proxmox MCP (TypeScript)

MCP server for [Proxmox VE](https://www.proxmox.com/en/proxmox-ve) — lets AI assistants (Claude Code, etc.) manage QEMU VMs, LXC containers, storage, network, HA, replication, SDN, and node admin.

**195 tools** · 3 transports (stdio / HTTP-SSE / streamable) · user-confirmation-gated destructive ops

## Supported tools (195)

**Foundation (24)** — `get_cluster_status`, `get_nodes`, `get_node_status`, `get_storage`, `list_tasks`, `get_task`, `get_task_log`, `list_jobs`, `get_job`, `poll_job`, `cancel_job`, `retry_job` · snapshot / backup / ISO + template CRUD

**VM (45)** — CRUD + lifecycle (`get_vms`, `get_vm_config`, `create_vm`, `clone_vm`, `start/stop/shutdown/reset/reboot/delete_vm`) · config (`update_vm_config`, `resize_vm_disk`, `set_vm_cloudinit`) · diagnostics (RRD, 10× QEMU guest agent, `vm_monitor`, `vm_firewall_rules`) · migration + console (VNC / SPICE / termproxy)

**Container (35)** — CRUD + lifecycle + config (`update_container_resources`, `resize_container_disk`) · diagnostics (RRD, firewall, **`execute_container_command`** via SSH + `pct exec`) · migration + console

**Cluster (23)** — Resource pools (5) · HA resources + groups (11) · Scheduled vzdump jobs (7)

**Node admin (40)** — apt / DNS / hosts / time (15) · bulk ops (4) · subscription (4) · systemd services (7) · network bonds/bridges/VLANs/OVS (5) · disks + ZFS (5) · certificates (2)

**Storage (5)** — `list_storages`, `get_storage`, `create/update/delete_storage` (lvm, zfs, nfs, cifs, pbs, dir, …)

**Replication (7)** + **SDN (22)** — ZFS replication jobs · SDN controllers / zones / vnets / subnets + `apply_sdn`

> 25 destructive tools and several high-risk tools prompt for a user yes/no before running (or honour `PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE=true` to skip the prompt). List them: `proxmox-mcps-print-tools destructive`.

## Install

### From npm (recommended)

```bash
npx proxmox-mcps
# or install globally
npm install -g proxmox-mcps
proxmox-mcps         # CLI binary (installed by the package above)
```

### From source

```bash
git clone https://github.com/your-username/proxmox-mcps.git
cd proxmox-mcps
npm install
cp .env.example .env       # fill in Proxmox host + API token
npm run check-config       # validate env
npm run build              # tsc → dist/
npm start                  # node dist/index.js
```

## Configure for Claude Code

Install at **user scope** so the same `proxmox` MCP server is available in every project without committing secrets to a repo:

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

> `--scope user` writes the entry to `~/.claude.json` (or `~/.config/claude/` on Linux), so it follows you across every repo on the machine. Use `--scope project` instead if you want the entry stored in `.mcp.json` of a specific repo (and committed for the team), or `--scope local` (the default) for a one-off project-local entry.

Restart Claude Code, verify with `/mcp` (should show `proxmox` with 195 tools). To inspect or remove the user-scope entry later:

```bash
claude mcp list                # show all configured servers
claude mcp get proxmox         # show env vars + command for the proxmox entry
claude mcp remove proxmox      # delete the user-scope entry
```

### Get an API token

Proxmox UI → **Datacenter → Permissions → API Tokens → Add** → user `root@pam`, token ID `mcp`, uncheck **Privilege Separation** → copy the secret UUID into `PROXMOX_TOKEN_VALUE`.

Full env-var reference: [`.env.example`](.env.example).

## Destructive & high-risk tools

Any tool classified as `high` or `destructive` (deletes, wipes, template conversions, SDN apply, network reconfig, subscription updates, etc.) does **not** run immediately. The server returns a confirmation prompt that the model must show to you:

```
⚠️  Confirmation required: 'delete_vm' is DESTRUCTIVE and cannot be undone.
Target: node=pve, vmid=100
Ask the user to reply 'yes' to proceed, or anything else to cancel.
If they confirm, re-invoke this tool with `confirm: true` added to the arguments.
```

After you reply "yes", the model calls the same tool again with `confirm: true` and the operation proceeds. This keeps every destructive action behind an explicit, visible human yes/no.

To skip the prompt for fully trusted automation, set:

```bash
PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE=true
```

Audit-only logging for medium-risk tools is independent: `PROXMOX_MCP_AUDIT_ONLY=true` logs each medium-risk call without changing whether it runs.

Inspect the risk registry at any time:

```bash
proxmox-mcps-print-tools            # all 195 tools
proxmox-mcps-print-tools destructive # only high + destructive
```

## Updating proxmox-mcps

Pick the install method you used — the upgrade steps differ.

### Check what's published

```bash
npm view proxmox-mcps version        # latest version on npm
npm view proxmox-mcps versions --json | tail -20   # last 20 versions
```

For source installs the version is in `package.json`. After restart, the server logs `proxmox-mcps.starting` on stderr with the build tag baked in.

### a. `npx proxmox-mcps` (Claude Code, Cursor, MCP clients)

Nothing to do — `npx` re-fetches the package on every launch, so you always get the latest published version automatically.

```bash
# Pin to a specific version if you want to defer updates
npx -y proxmox-mcps@0.2.0
```

Restart Claude Code (or your MCP client) so it picks up the new tool list.

### b. `npm install -g proxmox-mcps`

```bash
# See what's installed vs what's available
npm outdated -g proxmox-mcps

# Upgrade to the latest published version
npm update -g proxmox-mcps
# …or pin to a specific tag
npm install -g proxmox-mcps@latest
npm install -g proxmox-mcps@0.2.0
```

Then restart the MCP client (Claude Code, etc.) so it spawns the new binary.

### c. Source install (`git clone` + `npm run build`)

```bash
git pull                               # fetch latest commits
git checkout v0.2.0                    # optional — pin to a tag
npm install                            # pick up any new/changed deps
npm run build                          # tsc → dist/
npm test                               # 179 tests must still pass
```

Restart the running server (`npm start` or your process manager) so it loads the new build.

### Verify after upgrading

```bash
PROXMOX_HOST=… npm run check-config    # env still validates
proxmox-mcps-print-tools               # tool list complete and registered
```

In Claude Code, run `/mcp` — the `proxmox` server should still appear with the same env vars and all 195 tools should respond. If a tool returns a schema-validation error, the client cached an old tool list; restart the client.

### Read the release notes first for breaking changes

Minor bumps (0.1 → 0.2) may rename env vars or remove tool arguments. Always skim the [release notes](https://github.com/ngocdd/proxmox-mcps/releases) before upgrading a production install — each release calls out migration steps and any new env vars you need to add to your `.env`.

## For maintainers — updating dependencies

### 1. Check what's outdated

```bash
npm outdated                 # see available updates (Current → Wanted → Latest)
npm audit                    # known security vulnerabilities
```

### 2. Apply updates — pick by risk level

```bash
# Safe: stay within current SemVer range (patch + minor)
npm update

# Targeted: bump one package to latest matching its range
npm install <pkg>@latest

# Security-only fix, no breaking changes
npm audit fix

# Security fix with possible breaking changes (vitest 2.x → 4.x etc.)
npm audit fix --force
```

### 3. Verify after every update

```bash
npm run build   # tsc must pass
npm test        # 179 tests must still pass
```

If anything breaks, check the package's changelog. For major bumps (e.g. `vitest@2 → 4`) you may need to update test config, imports, or API calls.

### 4. Native deps & `allow-scripts`

Some packages need install scripts at install time:

- `better-sqlite3` (native)
- `ssh2` (native)
- `cpu-features` (transitive of `ssh2`)
- `esbuild` (transitive of `vitest`/`tsx`)
- `fsevents` (macOS file watcher)

npm 11+ prints a warning unless the package is on the allowlist in [`.npmrc`](.npmrc):

```ini
allow-scripts[]=better-sqlite3
allow-scripts[]=ssh2
allow-scripts[]=cpu-features
allow-scripts[]=esbuild
allow-scripts[]=fsevents
```

> If you add a new native dep, append its name here or npm will warn on every install. The boolean form `allow-scripts=true` does **not** silence the warning in npm 11.

### 5. Pitfalls

- **`prebuild-install@7.x` deprecation** — transitive of `better-sqlite3`/`ssh2`. Already at latest upstream; no fix from our side until the native module drops it.
- **Major version bumps** — `vitest@2 → 4`, `zod@3 → 4`, `@modelcontextprotocol/sdk@1 → 2` all require code/test changes. Always run `npm test` after `--force`.
- **`uuid` was removed** — the project uses `crypto.randomUUID()` from `node:crypto`. Don't re-add the `uuid` npm package unless you actually import it.

## License

MIT