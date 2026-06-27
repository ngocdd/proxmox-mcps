/**
 * Strongly-typed config derived from validated env.
 *
 * After env validation, we normalize into AppConfig — the value object every
 * module reads from. No module should re-read process.env.
 */
import type { EnvInput } from "./env.js";

export interface ProxmoxConfig {
  host: string;
  port: number;
  user: string;
  tokenName: string;
  tokenValue: string;
  verifySsl: boolean;
  timeoutMs: number;
  service: "PVE" | "PMG" | "PBS";
}

export interface SafetyConfig {
  devMode: boolean;
  dangerouslyAllowDestructive: boolean;
  auditOnly: boolean;
}

export interface SshConfig {
  user: string;
  port: number;
  keyFile: string | null;
  password: string | null;
  hostOverrides: Record<string, string>;
  knownHostsFile: string | null;
  strictHostKeyChecking: boolean;
}

export interface RetryJobConfig {
  retryMax: number;
  retryBaseMs: number;
  jobTtlHours: number;
  jobStore: "memory" | "sqlite";
  jobSqlitePath: string;
  /** HTTP transport host/port for non-stdio modes. */
  httpHost: string;
  httpPort: number;
}

export interface DownloadGuardConfig {
  allowedSchemes: ReadonlyArray<string>;
  allowedHosts: ReadonlyArray<string>;
}

export interface AppConfig {
  proxmox: ProxmoxConfig;
  safety: SafetyConfig;
  ssh: SshConfig;
  retryJob: RetryJobConfig;
  download: DownloadGuardConfig;
  logLevel: "debug" | "info" | "warn" | "error";
  logPretty: boolean;
}

/**
 * Build AppConfig from validated env input.
 */
export function buildAppConfig(env: EnvInput): AppConfig {
  return {
    proxmox: {
      host: env.PROXMOX_HOST,
      port: env.PROXMOX_PORT,
      user: env.PROXMOX_USER,
      tokenName: env.PROXMOX_TOKEN_NAME,
      tokenValue: env.PROXMOX_TOKEN_VALUE,
      verifySsl: env.PROXMOX_VERIFY_SSL,
      timeoutMs: env.PROXMOX_TIMEOUT_MS,
      service: env.PROXMOX_SERVICE,
    },
    safety: {
      devMode: env.PROXMOX_DEV_MODE,
      dangerouslyAllowDestructive: env.PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE,
      auditOnly: env.PROXMOX_MCP_AUDIT_ONLY,
    },
    ssh: {
      user: env.PROXMOX_SSH_USER,
      port: env.PROXMOX_SSH_PORT,
      keyFile: env.PROXMOX_SSH_KEY_FILE || null,
      password: env.PROXMOX_SSH_PASSWORD || null,
      hostOverrides: env.PROXMOX_SSH_HOST_OVERRIDES ?? {},
      knownHostsFile: env.PROXMOX_SSH_KNOWN_HOSTS_FILE || null,
      strictHostKeyChecking: env.PROXMOX_SSH_STRICT_HOST_KEY_CHECKING,
    },
    retryJob: {
      retryMax: env.PROXMOX_MCP_RETRY_MAX,
      retryBaseMs: env.PROXMOX_MCP_RETRY_BASE_MS,
      jobTtlHours: env.PROXMOX_MCP_JOB_TTL_HOURS,
      jobStore: env.PROXMOX_MCP_JOB_STORE,
      jobSqlitePath: env.PROXMOX_MCP_JOB_SQLITE_PATH,
      httpHost: env.MCP_HOST,
      httpPort: env.MCP_PORT,
    },
    download: {
      allowedSchemes: env.PROXMOX_DOWNLOAD_ALLOWED_SCHEMES,
      allowedHosts: env.PROXMOX_DOWNLOAD_ALLOWED_HOSTS,
    },
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY,
  };
}