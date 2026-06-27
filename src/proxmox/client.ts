/**
 * ProxmoxClient — thin axios wrapper for the Proxmox VE REST API.
 *
 * Responsibilities:
 *  - Inject Authorization: PVEAPIToken=... header on every request
 *  - Attach X-Request-Id for log correlation
 *  - Parse { data: ... } envelope
 *  - Map non-2xx responses into typed ProxmoxApiError subclasses
 *  - Optionally wrap calls in retry logic
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { randomUUID } from "node:crypto";
import https from "node:https";
import { authHeader } from "./auth.js";
import {
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
  ProxmoxApiError,
  RateLimitError,
} from "./errors.js";
import type { ProxmoxErrorResponse, ProxmoxResponse } from "./types.js";
import { withRetry, type RetryConfig } from "../retry.js";
import type { ProxmoxConfig } from "../config/types.js";
import type { Logger } from "../log.js";

export interface ProxmoxClientOptions {
  proxmox: ProxmoxConfig;
  retry?: RetryConfig;
  logger?: Logger;
}

export class ProxmoxClient {
  private readonly http: AxiosInstance;
  private readonly retryCfg: RetryConfig;
  private readonly logger: Logger | undefined;

  constructor(opts: ProxmoxClientOptions) {
    this.retryCfg = opts.retry ?? { max: 3, baseMs: 200 };
    this.logger = opts.logger;

    const baseURL = `https://${opts.proxmox.host}:${opts.proxmox.port}/api2/json`;

    this.http = axios.create({
      baseURL,
      timeout: opts.proxmox.timeoutMs,
      httpsAgent: undefined, // use default TLS agent; verify_ssl is handled below
      // axios honors `rejectUnauthorized` via the httpsAgent; we use a custom
      // agent to keep that out of the global axios defaults.
      headers: {
        Authorization: authHeader(
          opts.proxmox.user,
          opts.proxmox.tokenName,
          opts.proxmox.tokenValue,
        ),
        Accept: "application/json",
      },
      // Disable axios' default JSON parsing so we control it
      transformResponse: (data) => data,
      validateStatus: () => true, // we'll throw ourselves
    });

    // Custom httpsAgent for verify_ssl
    if (!opts.proxmox.verifySsl) {
      this.http.defaults.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }

    // Request interceptor: add X-Request-Id
    this.http.interceptors.request.use((cfg) => {
      cfg.headers.set("X-Request-Id", randomUUID());
      return cfg;
    });
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Perform an authenticated GET. Returns the unwrapped `data` field.
   */
  async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  /** POST with optional JSON body. */
  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  /** PUT with optional JSON body. */
  async put<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  /** DELETE with optional query params. */
  async delete<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>("DELETE", path, undefined, params);
  }

  // ---- Internals ----------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const start = Date.now();

    const op = async (): Promise<T> => {
      const reqCfg: AxiosRequestConfig = {
        method,
        url: path,
        params,
        data: body,
        // axios requires Content-Type for non-GET bodies
        headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
        // Proxmox accepts both JSON body and form-encoded; we use form-encoded
        // because Proxmox prefers it for /qemu and /lxc POST.
        transformRequest: body
          ? (data) => {
              if (data == null) return undefined;
              if (typeof data === "string") return data;
              return Object.entries(data)
                .filter(([, v]) => v !== undefined && v !== null)
                .map(
                  ([k, v]) =>
                    `${encodeURIComponent(k)}=${encodeURIComponent(
                      Array.isArray(v) ? v.join(",") : String(v),
                    )}`,
                )
                .join("&");
            }
          : undefined,
      };

      const res = await this.http.request(reqCfg);
      const elapsedMs = Date.now() - start;
      this.logger?.debug(
        { method, path, status: res.status, elapsedMs, requestId: res.headers["x-request-id"] },
        "proxmox.request",
      );

      if (res.status >= 200 && res.status < 300) {
        return parseResponse<T>(res.data);
      }

      // Error path
      const err = buildError(method, path, res.status, res.data, res.headers["x-request-id"]);
      this.logger?.warn(
        { method, path, status: err.status, message: err.message, errors: err.errors },
        "proxmox.error",
      );
      throw err;
    };

    return withRetry(op, this.retryCfg);
  }

  /** Close underlying http agent (for graceful shutdown). */
  close(): void {
    // axios will GC; nothing to do explicitly
  }
}

// ---- Helpers --------------------------------------------------------------

function parseResponse<T>(raw: unknown): T {
  if (raw == null) return undefined as unknown as T;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "data" in parsed) {
        return (parsed as ProxmoxResponse<T>).data;
      }
      return parsed as T;
    } catch {
      // Not JSON; return raw string
      return raw as unknown as T;
    }
  }
  if (typeof raw === "object" && "data" in (raw as object)) {
    return (raw as ProxmoxResponse<T>).data;
  }
  return raw as T;
}

function buildError(
  method: string,
  path: string,
  status: number,
  body: unknown,
  requestId: string | undefined,
): ProxmoxApiError {
  const err = parseErrorBody(body);
  const message = err.message ?? `${method} ${path} failed with ${status}`;
  const errors = err.errors ?? {};

  switch (status) {
    case 401:
      return new AuthenticationError(path, message, requestId ?? null);
    case 403:
      return new PermissionDeniedError(path, message, requestId ?? null);
    case 404:
      return new NotFoundError(path, message, requestId ?? null);
    case 429: {
      // Retry-After is read from raw response by caller in retry logic; here
      // we just surface the error.
      const retryAfter = extractRetryAfter(body);
      return new RateLimitError(path, retryAfter, message, requestId ?? null);
    }
    default:
      return new ProxmoxApiError({ status, message, errors, path, requestId: requestId ?? null });
  }
}

function parseErrorBody(body: unknown): {
  message?: string;
  errors?: Record<string, string>;
} {
  if (body == null) return {};
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return extractErrorFromObject(parsed);
    } catch {
      return { message: body };
    }
  }
  if (typeof body === "object") {
    return extractErrorFromObject(body);
  }
  return {};
}

function extractErrorFromObject(obj: unknown): {
  message?: string;
  errors?: Record<string, string>;
} {
  if (obj == null || typeof obj !== "object") return {};
  const o = obj as ProxmoxErrorResponse;
  return {
    message: o.message,
    errors: o.errors,
  };
}

function extractRetryAfter(body: unknown): number | null {
  if (body == null || typeof body !== "object") return null;
  // Proxmox typically returns errors as JSON; sometimes Retry-After is in headers
  const o = body as { retry_after?: number; retryAfter?: number };
  if (typeof o.retry_after === "number") return o.retry_after;
  if (typeof o.retryAfter === "number") return o.retryAfter;
  return null;
}