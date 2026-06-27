/**
 * Retry wrapper using p-retry with exponential backoff + jitter.
 *
 * Only retries on transient errors (network, 5xx, 429). 4xx errors bubble up
 * immediately so the caller gets a fast-fail for bad requests.
 */
import pRetry, { type Options as PRetryOptions } from "p-retry";

export interface RetryConfig {
  max: number; // 0..10
  baseMs: number; // 50..10000
}

export const DEFAULT_RETRY: RetryConfig = { max: 3, baseMs: 200 };

/**
 * Predicate: should this error be retried?
 *
 * Default: only network errors and HTTP 5xx/429 are retried. 4xx (other than
 * 429) is treated as a permanent failure (bad request, not found, etc.).
 */
export type ShouldRetry = (err: unknown) => boolean;

export function defaultShouldRetry(err: unknown): boolean {
  // Network / DNS / socket-level errors usually surface as plain Error with no
  // .status; let p-retry treat those as transient.
  if (err instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any).status as number | undefined;
    if (typeof status === "number") {
      if (status === 429) return true;
      if (status >= 500 && status < 600) return true;
      return false;
    }
    // No status => likely a network error
    return true;
  }
  return false;
}

/**
 * Run `fn` with retry. Honors Retry-After hint on 429/503 when available.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  cfg: RetryConfig = DEFAULT_RETRY,
  shouldRetry: ShouldRetry = defaultShouldRetry,
  onFailedAttempt?: (err: unknown, attempt: number) => void,
): Promise<T> {
  const opts: PRetryOptions = {
    retries: cfg.max,
    minTimeout: cfg.baseMs,
    maxTimeout: cfg.baseMs * 32, // exponential ceiling
    factor: 2,
    randomize: true,
    shouldRetry: (err) => shouldRetry(err),
  };

  return pRetry(async (attempt) => {
    try {
      return await fn();
    } catch (err) {
      if (onFailedAttempt) onFailedAttempt(err, attempt);
      throw err;
    }
  }, opts);
}