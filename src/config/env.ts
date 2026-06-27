/**
 * Environment variable schema. Single source of truth for runtime config.
 *
 * Validates process.env at startup. Exits with code 2 on validation failure.
 */
import { z } from "zod";
import type { LoggerConfig } from "../log.js";

const USER_REGEX = /^[\w.\-]+(@[a-z][a-z0-9\-]+)?$/i;
const HOST_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9\-_.]*[a-zA-Z0-9])?$/;

const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
const ServiceSchema = z.enum(["PVE", "PMG", "PBS"]);

/**
 * Coerce env-style boolean strings to actual booleans. z.coerce.boolean() is
 * broken (any non-empty string is truthy), so we explicitly map "true"/"1" to
 * true and everything else to false.
 */
const BoolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === "boolean") return v;
    return /^(true|1|yes|on)$/i.test(v.trim());
  });

const SshHostOverridesSchema = z
  .string()
  .optional()
  .transform((raw) => {
    if (!raw || raw.trim() === "") return {} as Record<string, string>;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("PROXMOX_SSH_HOST_OVERRIDES must be a JSON object");
      }
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== "string") {
          throw new Error(`PROXMOX_SSH_HOST_OVERRIDES[${k}] must be a string`);
        }
        out[k] = v;
      }
      return out;
    } catch (err) {
      throw new Error(
        `PROXMOX_SSH_HOST_OVERRIDES: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

const EnvSchema = z
  .object({
    // Proxmox API connection
    PROXMOX_HOST: z.string().min(1).regex(HOST_REGEX, "invalid hostname"),
    PROXMOX_PORT: z.coerce.number().int().min(1).max(65535).default(8006),
    PROXMOX_USER: z.string().regex(USER_REGEX, "must be like 'user@realm'"),
    PROXMOX_TOKEN_NAME: z.string().min(1),
    PROXMOX_TOKEN_VALUE: z.string().min(8),
    PROXMOX_VERIFY_SSL: BoolFromString.default(true),
    PROXMOX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
    PROXMOX_SERVICE: ServiceSchema.default("PVE"),

    // Safety
    PROXMOX_DEV_MODE: BoolFromString.default(false),
    PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE: BoolFromString.default(false),
    PROXMOX_MCP_AUDIT_ONLY: BoolFromString.default(false),

    // Logging
    LOG_LEVEL: LogLevelSchema.default("info"),
    LOG_PRETTY: BoolFromString.default(false),

    // Retry & jobs
    PROXMOX_MCP_RETRY_MAX: z.coerce.number().int().min(0).max(10).default(3),
    PROXMOX_MCP_RETRY_BASE_MS: z.coerce.number().int().min(50).max(10_000).default(200),
    PROXMOX_MCP_JOB_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    PROXMOX_MCP_JOB_STORE: z.enum(["memory", "sqlite"]).default("memory"),
    PROXMOX_MCP_JOB_SQLITE_PATH: z.string().min(1).default("./proxmox-jobs.sqlite3"),

    // Transport (Phase 2A)
    MCP_TRANSPORT: z.enum(["STDIO", "SSE", "STREAMABLE"]).default("STDIO"),
    MCP_HOST: z.string().default("127.0.0.1"),
    MCP_PORT: z.coerce.number().int().min(1).max(65535).default(8000),

    // SSH (for `pct exec` on containers)
    PROXMOX_SSH_USER: z.string().default("root"),
    PROXMOX_SSH_PORT: z.coerce.number().int().min(1).max(65535).default(22),
    PROXMOX_SSH_KEY_FILE: z.string().optional().or(z.literal("")),
    PROXMOX_SSH_PASSWORD: z.string().optional().or(z.literal("")),
    PROXMOX_SSH_HOST_OVERRIDES: SshHostOverridesSchema,
    PROXMOX_SSH_KNOWN_HOSTS_FILE: z.string().optional().or(z.literal("")),
    PROXMOX_SSH_STRICT_HOST_KEY_CHECKING: BoolFromString.default(true),

    // Download guard (SSRF mitigation for download_iso etc.)
    PROXMOX_DOWNLOAD_ALLOWED_SCHEMES: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((raw) =>
        !raw || raw.trim() === ""
          ? (["http", "https"] as const)
          : (raw
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean) as string[]),
      ),
    PROXMOX_DOWNLOAD_ALLOWED_HOSTS: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((raw) =>
        !raw || raw.trim() === ""
          ? ([] as string[])
          : raw.split(",").map((s) => s.trim()).filter(Boolean),
      ),
  })
  .superRefine((data, ctx) => {
    // Guard: verify_ssl=false requires dev_mode=true
    if (!data.PROXMOX_VERIFY_SSL && !data.PROXMOX_DEV_MODE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROXMOX_VERIFY_SSL"],
        message: "PROXMOX_VERIFY_SSL=false requires PROXMOX_DEV_MODE=true",
      });
    }

    // Guard: at least one of key_file or password for SSH (warning only)
    // We don't enforce — user might want password prompt via agent.
  });

export type EnvInput = z.infer<typeof EnvSchema>;

/**
 * Parse and validate process.env. Throws ZodError on failure.
 */
export function parseEnv(env: NodeJS.ProcessEnv = process.env): EnvInput {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/**
 * Parse and exit with code 2 on failure. Use in entry points.
 */
export function parseEnvOrExit(env: NodeJS.ProcessEnv = process.env): EnvInput {
  try {
    return parseEnv(env);
  } catch (err) {
    process.stderr.write(
      `\n[FATAL] ${err instanceof Error ? err.message : String(err)}\n\n` +
        `Run 'npm run check-config' to diagnose, or 'cp .env.example .env' to start.\n`,
    );
    process.exit(2);
  }
}

/**
 * Build a LoggerConfig from env.
 */
export function loggerConfigFromEnv(env: EnvInput): LoggerConfig {
  return { level: env.LOG_LEVEL, pretty: env.LOG_PRETTY };
}