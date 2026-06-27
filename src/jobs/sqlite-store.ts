/**
 * SQLite-backed JobStore.
 *
 * Persists long-running Proxmox jobs across restarts. Schema is migrated
 * forward by version — see `migrate()` for the canonical list of changes.
 *
 * Backed by `better-sqlite3` (synchronous, fast, single-process). For multi-
 * process use, enable WAL mode (set by default) and serialize via a mutex.
 */
import BetterSqlite3, { type Database as BetterSqliteDb } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Logger } from "../log.js";
import type { CreateJobOpts, JobRecord, JobStatus, JobStore } from "./store.js";

export interface SqliteJobStoreOptions {
  sqlitePath: string;
  ttlHours: number;
  logger?: Logger;
}

const SCHEMA_VERSION = 1;

const SCHEMA_DDL: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS jobs (
      job_id        TEXT PRIMARY KEY,
      upid          TEXT,
      tool          TEXT NOT NULL,
      args_json     TEXT NOT NULL,
      node          TEXT,
      status        TEXT NOT NULL,
      started_at    INTEGER NOT NULL,
      ended_at      INTEGER,
      progress      INTEGER,
      exit_status   TEXT,
      result_json   TEXT,
      last_error    TEXT,
      retry_count   INTEGER NOT NULL DEFAULT 0,
      previous_upids_json TEXT NOT NULL DEFAULT '[]',
      retry_spec_json     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON jobs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_status_started ON jobs(status, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_tool_started ON jobs(tool, started_at DESC);
  `,
};

export class SqliteJobStore implements JobStore {
  private readonly db: BetterSqliteDb;
  private readonly ttlMs: number;
  private readonly logger: Logger | undefined;

  // Prepared statements (cached for perf)
  private readonly stmtInsert: BetterSqlite3.Statement;
  private readonly stmtGet: BetterSqlite3.Statement;
  private readonly stmtList: BetterSqlite3.Statement;
  private readonly stmtUpdate: BetterSqlite3.Statement;
  private readonly stmtDelete: BetterSqlite3.Statement;
  private readonly stmtEvict: BetterSqlite3.Statement;
  private readonly stmtSetUpid: BetterSqlite3.Statement;

  constructor(opts: SqliteJobStoreOptions) {
    this.ttlMs = opts.ttlHours * 60 * 60 * 1000;
    this.logger = opts.logger;

    // Ensure parent directory exists
    mkdirSync(dirname(opts.sqlitePath), { recursive: true });

    this.db = new BetterSqlite3(opts.sqlitePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");

    this.migrate();

    this.stmtInsert = this.db.prepare(`
      INSERT INTO jobs (
        job_id, upid, tool, args_json, node, status, started_at, retry_count,
        previous_upids_json, retry_spec_json
      ) VALUES (
        @job_id, @upid, @tool, @args_json, @node, @status, @started_at, @retry_count,
        @previous_upids_json, @retry_spec_json
      )
    `);

    this.stmtGet = this.db.prepare(`SELECT * FROM jobs WHERE job_id = ?`);

    this.stmtList = this.db.prepare(`
      SELECT * FROM jobs
      WHERE (@status IS NULL OR status = @status)
        AND (@tool IS NULL OR tool = @tool)
      ORDER BY started_at DESC
      LIMIT @limit
    `);

    this.stmtUpdate = this.db.prepare(`
      UPDATE jobs SET
        started_at = COALESCE(@started_at, started_at),
        upid = COALESCE(@upid, upid),
        status = COALESCE(@status, status),
        progress = COALESCE(@progress, progress),
        exit_status = COALESCE(@exit_status, exit_status),
        ended_at = COALESCE(@ended_at, ended_at),
        result_json = COALESCE(@result_json, result_json),
        last_error = COALESCE(@last_error, last_error),
        retry_count = COALESCE(@retry_count, retry_count),
        previous_upids_json = COALESCE(@previous_upids_json, previous_upids_json),
        retry_spec_json = COALESCE(@retry_spec_json, retry_spec_json)
      WHERE job_id = @job_id
    `);

    this.stmtDelete = this.db.prepare(`DELETE FROM jobs WHERE job_id = ?`);
    this.stmtEvict = this.db.prepare(`DELETE FROM jobs WHERE COALESCE(ended_at, started_at) < ?`);
    this.stmtSetUpid = this.db.prepare(`
      UPDATE jobs SET
        previous_upids_json = @previous_upids_json,
        upid = @upid,
        status = 'running'
      WHERE job_id = @job_id
    `);
  }

  // ---- JobStore interface --------------------------------------------------

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

    this.stmtInsert.run({
      job_id: job.job_id,
      upid: job.upid,
      tool: job.tool,
      args_json: JSON.stringify(job.args),
      node: job.node,
      status: job.status,
      started_at: job.started_at,
      retry_count: job.retry_count,
      previous_upids_json: JSON.stringify(job.previous_upids),
      retry_spec_json: JSON.stringify(job.retry_spec),
    });

    this.logger?.debug({ job_id: job.job_id, tool: job.tool, upid: job.upid }, "jobs.created");
    return job;
  }

  get(jobId: string): JobRecord | null {
    const row = this.stmtGet.get(jobId) as JobRow | undefined;
    return row ? rowToJob(row) : null;
  }

  list(filter: { status?: JobStatus; tool?: string; limit?: number } = {}): JobRecord[] {
    const rows = this.stmtList.all({
      status: filter.status ?? null,
      tool: filter.tool ?? null,
      limit: filter.limit ?? 100,
    }) as JobRow[];
    return rows.map(rowToJob);
  }

  setUpid(jobId: string, upid: string): void {
    const existing = this.get(jobId);
    if (!existing) return;
    const previous = [...existing.previous_upids];
    if (existing.upid) previous.push(existing.upid);
    this.stmtSetUpid.run({
      job_id: jobId,
      upid,
      previous_upids_json: JSON.stringify(previous),
    });
  }

  update(jobId: string, patch: Partial<JobRecord>): void {
    // prepared statement has all named params; provide null for any field
    // we're not updating so better-sqlite3 doesn't throw "Missing parameter".
    const row: Record<string, unknown> = {
      job_id: jobId,
      started_at: patch.started_at !== undefined ? patch.started_at : null,
      upid: patch.upid !== undefined ? patch.upid : null,
      status: patch.status !== undefined ? patch.status : null,
      progress: patch.progress !== undefined ? patch.progress : null,
      exit_status: patch.exit_status !== undefined ? patch.exit_status : null,
      ended_at: patch.ended_at !== undefined ? patch.ended_at : null,
      result_json: patch.result !== undefined ? JSON.stringify(patch.result) : null,
      last_error: patch.last_error !== undefined ? patch.last_error : null,
      retry_count: patch.retry_count !== undefined ? patch.retry_count : null,
      previous_upids_json:
        patch.previous_upids !== undefined ? JSON.stringify(patch.previous_upids) : null,
      retry_spec_json: patch.retry_spec !== undefined ? JSON.stringify(patch.retry_spec) : null,
    };
    this.stmtUpdate.run(row);
  }

  delete(jobId: string): boolean {
    const result = this.stmtDelete.run(jobId);
    return result.changes > 0;
  }

  evictExpired(): number {
    const cutoff = Date.now() - this.ttlMs;
    const result = this.stmtEvict.run(cutoff);
    if (result.changes > 0) {
      this.logger?.debug({ removed: result.changes }, "jobs.evicted");
    }
    return result.changes;
  }

  close(): void {
    this.db.close();
  }

  // ---- Internals -----------------------------------------------------------

  private migrate(): void {
    // Bootstrap schema_migrations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const applied = (this.db.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as { v: number | null }).v ?? 0;

    for (let v = applied + 1; v <= SCHEMA_VERSION; v++) {
      const ddl = SCHEMA_DDL[v];
      if (!ddl) continue;
      this.db.transaction(() => {
        this.db.exec(ddl);
        this.db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`).run(v, Date.now());
      })();
      this.logger?.info({ version: v }, "jobs.migration_applied");
    }
  }
}

// ---- Row ↔ JobRecord mapping ---------------------------------------------

interface JobRow {
  job_id: string;
  upid: string | null;
  tool: string;
  args_json: string;
  node: string | null;
  status: JobStatus;
  started_at: number;
  ended_at: number | null;
  progress: number | null;
  exit_status: string | null;
  result_json: string | null;
  last_error: string | null;
  retry_count: number;
  previous_upids_json: string;
  retry_spec_json: string | null;
}

function rowToJob(row: JobRow): JobRecord {
  let result: unknown = null;
  try {
    if (row.result_json) result = JSON.parse(row.result_json);
  } catch {
    /* ignore malformed */
  }

  let retrySpec: JobRecord["retry_spec"] = null;
  try {
    if (row.retry_spec_json) retrySpec = JSON.parse(row.retry_spec_json);
  } catch {
    /* ignore */
  }

  let previousUpids: string[] = [];
  try {
    if (row.previous_upids_json) previousUpids = JSON.parse(row.previous_upids_json);
  } catch {
    /* ignore */
  }

  let args: Record<string, unknown> = {};
  try {
    if (row.args_json) args = JSON.parse(row.args_json);
  } catch {
    /* ignore */
  }

  return {
    job_id: row.job_id,
    upid: row.upid,
    tool: row.tool,
    args,
    node: row.node,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    progress: row.progress,
    exit_status: row.exit_status,
    result,
    last_error: row.last_error,
    retry_count: row.retry_count,
    previous_upids: previousUpids,
    retry_spec: retrySpec,
  };
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