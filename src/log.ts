/**
 * Logger singleton — pino configured for stdio MCP transport.
 *
 * All log lines go to **stderr** (stdout is reserved for JSON-RPC).
 * Sensitive fields (tokens, passwords, SSH keys) are redacted automatically.
 */
import pino, { type Logger, type LoggerOptions } from "pino";

export type { Logger };

/** Fields that should never appear in log output. */
const REDACT_PATHS = [
  "*.token_value",
  "*.token",
  "*.tokenValue",
  "*.password",
  "*.ssh_password",
  "*.ssh_private_key",
  "*.new_password",
  "*.cipassword",
  "api.token",
  "config.PROXMOX_TOKEN_VALUE",
  "config.PROXMOX_SSH_PASSWORD",
  "config.proxmox.tokenValue",
  "config.proxmox.tokenName",
  "env.PROXMOX_TOKEN_VALUE",
  "env.PROXMOX_SSH_PASSWORD",
];

export interface LoggerConfig {
  level: "debug" | "info" | "warn" | "error";
  pretty: boolean;
}

let _logger: Logger | null = null;

/**
 * Build (or return cached) logger instance.
 *
 * @param cfg.level - pino log level
 * @param cfg.pretty - pretty-print via pino-pretty (dev only)
 */
export function getLogger(cfg: LoggerConfig = { level: "info", pretty: false }): Logger {
  if (_logger) return _logger;

  const options: LoggerOptions = {
    level: cfg.level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    base: { service: "proxmox-mcps" },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (cfg.pretty) {
    _logger = pino(
      options,
      pino.transport({
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
      }) as unknown as pino.DestinationStream,
    );
  } else {
    _logger = pino(options);
  }

  return _logger;
}

/**
 * Reset the cached logger. Useful for tests.
 */
export function resetLogger(): void {
  _logger = null;
}