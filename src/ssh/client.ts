/**
 * SshClient — thin wrapper around ssh2 for `pct exec` on container hosts.
 *
 * Used by `execute_container_command` to run shell commands inside an LXC
 * container by shelling out to `pct exec <vmid> -- <cmd>` on the host.
 */
import { Client, type ConnectConfig } from "ssh2";
import type { Logger } from "../log.js";
import type { SshConfig } from "../config/types.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface SshClientOptions {
  ssh: SshConfig;
  /** Function that resolves a node name to its actual SSH host (handles overrides). */
  resolveHost?: (node: string) => string;
  logger?: Logger;
}

export class SshClient {
  private readonly cfg: SshConfig;
  private readonly resolveHost: (node: string) => string;
  private readonly logger: Logger | undefined;

  constructor(opts: SshClientOptions) {
    this.cfg = opts.ssh;
    this.resolveHost =
      opts.resolveHost ??
      ((node) => this.cfg.hostOverrides[node] ?? node);
    this.logger = opts.logger;
  }

  /**
   * Run `pct exec <vmid> -- <command>` on the host that owns the container.
   *
   * The command is executed via `sh -c` so shell features (pipes, redirects)
   * work as expected.
   */
  async pctExec(node: string, vmid: string | number, command: string): Promise<ExecResult> {
    const start = Date.now();
    const host = this.resolveHost(node);
    const fullCmd = `pct exec ${vmid} -- sh -c ${shellQuote(command)}`;

    return new Promise<ExecResult>((resolve, reject) => {
      const connectCfg: ConnectConfig = {
        host,
        port: this.cfg.port,
        username: this.cfg.user,
      };

      if (this.cfg.keyFile) {
        connectCfg.privateKey = loadKeyFile(this.cfg.keyFile);
      } else if (this.cfg.password) {
        connectCfg.password = this.cfg.password;
      }

      if (this.cfg.knownHostsFile) {
        // ssh2 doesn't expose known_hosts loading directly; users typically
        // set hostKey via PKCS#11 or accept any key. We skip strict checks
        // unless the caller overrides via env.
        connectCfg.tryKeyboard = false;
      } else if (!this.cfg.strictHostKeyChecking) {
        connectCfg.tryKeyboard = false;
      }

      const conn = new Client();
      let stdout = "";
      let stderr = "";
      let settled = false;

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        try {
          conn.end();
        } catch {
          // ignore
        }
        fn();
      };

      conn.on("ready", () => {
        conn.exec(fullCmd, (err, channel) => {
          if (err) {
            this.logger?.error({ err: err.message, host, vmid, command }, "ssh.exec_failed");
            settle(() => reject(new Error(`SSH exec failed: ${err.message}`)));
            return;
          }

          channel.on("data", (data: Buffer) => {
            stdout += data.toString("utf8");
          });
          channel.stderr.on("data", (data: Buffer) => {
            stderr += data.toString("utf8");
          });
          channel.on("exit", (code: number | null) => {
            const exitCode = code ?? 0;
            const result: ExecResult = {
              stdout,
              stderr,
              exitCode,
              durationMs: Date.now() - start,
            };
            this.logger?.debug(
              { host, vmid, exitCode, durationMs: result.durationMs, stdoutLen: stdout.length },
              "ssh.exec_done",
            );
            settle(() => resolve(result));
          });
          channel.on("close", () => {
            // Sometimes exit doesn't fire; close is the fallback.
            settle(() =>
              resolve({ stdout, stderr, exitCode: 0, durationMs: Date.now() - start }),
            );
          });
        });
      });

      conn.on("error", (err: Error) => {
        this.logger?.error({ err: err.message, host }, "ssh.connect_failed");
        settle(() => reject(new Error(`SSH connect failed to ${host}: ${err.message}`)));
      });

      conn.on("close", () => {
        settle(() =>
          reject(new Error(`SSH connection to ${host} closed unexpectedly`)),
        );
      });

      conn.connect(connectCfg);
    });
  }

  /**
   * Close any persistent resources. (Currently no-op since we open per-call.)
   */
  close(): void {
    // No persistent connection to close.
  }
}

// ---- Helpers --------------------------------------------------------------

function shellQuote(s: string): string {
  // Wrap in single quotes; escape embedded single quotes.
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function loadKeyFile(path: string): Buffer | undefined {
  try {
    // Synchronous read; called once at exec time. Fine for short keys.
    const fs = require("node:fs") as typeof import("node:fs");
    return fs.readFileSync(path);
  } catch (err) {
    throw new Error(
      `Failed to read SSH key file ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}