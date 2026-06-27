/**
 * Proxmox API error hierarchy.
 *
 * Proxmox returns errors as JSON:
 *   { "errors": { "field1": "msg1", "field2": "msg2" }, "data": null }
 * or as plain text with a numeric status code.
 *
 * We normalize everything into typed errors so tool handlers can present
 * user-friendly messages and decide whether to retry.
 */

/** Base error for any Proxmox API failure. */
export class ProxmoxApiError extends Error {
  public readonly status: number;
  public readonly errors: Record<string, string>;
  public readonly path: string;
  public readonly requestId: string | null;

  constructor(opts: {
    status: number;
    message: string;
    errors?: Record<string, string>;
    path: string;
    requestId?: string | null;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "ProxmoxApiError";
    this.status = opts.status;
    this.errors = opts.errors ?? {};
    this.path = opts.path;
    this.requestId = opts.requestId ?? null;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }

  /** Whether this error is transient and worth retrying. */
  get isTransient(): boolean {
    return this.status === 429 || (this.status >= 500 && this.status < 600);
  }

  /** Concatenated user-readable error message. */
  get details(): string {
    const fields = Object.entries(this.errors);
    if (fields.length === 0) return this.message;
    return `${this.message}: ${fields.map(([k, v]) => `${k}=${v}`).join(", ")}`;
  }
}

export class NotFoundError extends ProxmoxApiError {
  constructor(path: string, message = "Resource not found", requestId?: string | null) {
    super({ status: 404, message, path, requestId });
    this.name = "NotFoundError";
  }
}

export class PermissionDeniedError extends ProxmoxApiError {
  constructor(path: string, message = "Permission denied", requestId?: string | null) {
    super({ status: 403, message, path, requestId });
    this.name = "PermissionDeniedError";
  }
}

export class AuthenticationError extends ProxmoxApiError {
  constructor(path: string, message = "Authentication failed", requestId?: string | null) {
    super({ status: 401, message, path, requestId });
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends ProxmoxApiError {
  public readonly retryAfterSeconds: number | null;

  constructor(
    path: string,
    retryAfterSeconds: number | null = null,
    message = "Rate limited",
    requestId?: string | null,
  ) {
    super({ status: 429, message, path, requestId });
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Raised by the policy gate when a high-risk tool is invoked without approval.
 */
export class ApprovalRequiredError extends Error {
  public readonly tool: string;
  public readonly risk: "high" | "destructive";

  constructor(tool: string, risk: "high" | "destructive") {
    super(
      `Tool '${tool}' is ${risk}-risk and requires either an 'approval_token' argument ` +
        `matching PROXMOX_MCP_APPROVAL_TOKEN, or PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE=true.`,
    );
    this.name = "ApprovalRequiredError";
    this.tool = tool;
    this.risk = risk;
  }
}