/**
 * Config entrypoint. Loads .env, parses env, returns AppConfig.
 *
 * Usage:
 *   import { loadConfig } from "./config/index.js";
 *   const cfg = loadConfig();
 */
import "dotenv/config";
import { parseEnv, loggerConfigFromEnv } from "./env.js";
import { buildAppConfig, type AppConfig } from "./types.js";
import type { LoggerConfig } from "../log.js";

export { parseEnv, loggerConfigFromEnv } from "./env.js";
export type { EnvInput } from "./env.js";
export * from "./types.js";

let _config: AppConfig | null = null;
let _loggerConfig: LoggerConfig | null = null;

/**
 * Load (and cache) the AppConfig. Subsequent calls return the cached value.
 */
export function loadConfig(): AppConfig {
  if (_config) return _config;
  const env = parseEnv(process.env);
  _config = buildAppConfig(env);
  return _config;
}

/**
 * Load (and cache) the LoggerConfig.
 */
export function loadLoggerConfig(): LoggerConfig {
  if (_loggerConfig) return _loggerConfig;
  const env = parseEnv(process.env);
  _loggerConfig = loggerConfigFromEnv(env);
  return _loggerConfig;
}

/**
 * Reset cached config (tests).
 */
export function resetConfig(): void {
  _config = null;
  _loggerConfig = null;
}