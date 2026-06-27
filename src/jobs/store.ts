/**
 * JobStore — track long-running Proxmox tasks behind stable job_ids.
 *
 * Phase 1 ships an in-memory implementation behind a JobStore interface, so
 * Phase 2 can swap in SQLite-backed persistence without changing tool code.
 */
import { randomUUID } from "node:crypto";
import type { Logger } from "../log.js";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobRecord {
  job_id: string;
  upid: string | null;
  tool: string;
  args: Record<string, unknown>;
  node: string | null;
  status: JobStatus;
  started_at: number;
  ended_at: number | null;
  progress: number | null;
  exit_status: string | null;
  result: unknown;
  last_error: string | null;
  retry_count: number;
  previous_upids: string[];
  /** Stored recipe to re-invoke the tool on retry. */
  retry_spec: RetrySpec | null;
}

export interface RetrySpec {
  tool: string;
  args: Record<string, unknown>;
}

export interface CreateJobOpts {
  tool: string;
  args: Record<string, unknown>;
  node?: string | null;
  upid?: string | null;
}

export interface JobStore {
  create(opts: CreateJobOpts): JobRecord;
  get(jobId: string): JobRecord | null;
  list(filter?: { status?: JobStatus; tool?: string; limit?: number }): JobRecord[];
  setUpid(jobId: string, upid: string): void;
  update(jobId: string, patch: Partial<JobRecord>): void;
  delete(jobId: string): boolean;
  /** Remove jobs older than `ttlHours`. */
  evictExpired(): number;
}

export interface InMemoryJobStoreOptions {
  ttlHours: number;
  logger?: Logger;
}

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly ttlMs: number;
  private readonly logger: Logger | undefined;

  constructor(opts: InMemoryJobStoreOptions) {
    this.ttlMs = opts.ttlHours * 60 * 60 * 1000;
    this.logger = opts.logger;
  }

  create(opts: CreateJobOpts): JobRecord {
    const job: JobRecord = {
      job_id: randomUUID(),
      upid: opts.upid ?? null,
      tool: opts.tool,
      args: scrubArgs(opts.args),
      node: opts.node ?? null,
      status: opts.upid ? "running" : "queued",
      started_at: Date.now(),
      ended_at: null,
      progress: null,
      exit_status: null,
      result: null,
      last_error: null,
      retry_count: 0,
      previous_upids: [],
      retry_spec: { tool: opts.tool, args: scrubArgs(opts.args) },
    };
    this.jobs.set(job.job_id, job);
    this.logger?.debug({ job_id: job.job_id, tool: job.tool, upid: job.upid }, "jobs.created");
    return job;
  }

  get(jobId: string): JobRecord | null {
    return this.jobs.get(jobId) ?? null;
  }

  list(filter: { status?: JobStatus; tool?: string; limit?: number } = {}): JobRecord[] {
    const all = Array.from(this.jobs.values());
    const filtered = all.filter((j) => {
      if (filter.status && j.status !== filter.status) return false;
      if (filter.tool && j.tool !== filter.tool) return false;
      return true;
    });
    // Newest first
    filtered.sort((a, b) => b.started_at - a.started_at);
    return filter.limit ? filtered.slice(0, filter.limit) : filtered;
  }

  setUpid(jobId: string, upid: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.upid) {
      job.previous_upids.push(job.upid);
    }
    job.upid = upid;
    job.status = "running";
  }

  update(jobId: string, patch: Partial<JobRecord>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    Object.assign(job, patch);
  }

  delete(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  evictExpired(): number {
    const cutoff = Date.now() - this.ttlMs;
    let removed = 0;
    for (const [id, job] of this.jobs) {
      const referenceTime = job.ended_at ?? job.started_at;
      if (referenceTime < cutoff) {
        this.jobs.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger?.debug({ removed }, "jobs.evicted");
    }
    return removed;
  }
}

function scrubArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === "approval_token" || k === "password" || k === "new_password" || k === "cipassword") {
      out[k] = "[REDACTED]";
    } else {
      out[k] = v;
    }
  }
  return out;
}