import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteJobStore } from "../../src/jobs/sqlite-store.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pve-jobs-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeStore() {
  return new SqliteJobStore({
    sqlitePath: join(tmpDir, "jobs.sqlite3"),
    ttlHours: 24,
  });
}

describe("SqliteJobStore", () => {
  it("creates and retrieves jobs", () => {
    const store = makeStore();
    const job = store.create({ tool: "create_vm", args: { vmid: "100" }, node: "pve" });
    expect(job.tool).toBe("create_vm");
    const fetched = store.get(job.job_id);
    expect(fetched?.tool).toBe("create_vm");
    expect(fetched?.args).toEqual({ vmid: "100" });
    store.close();
  });

  it("persists across instances", () => {
    const path = join(tmpDir, "persist.sqlite3");
    const s1 = new SqliteJobStore({ sqlitePath: path, ttlHours: 24 });
    const job = s1.create({ tool: "create_vm", args: {}, node: "pve", upid: "UPID:abc" });
    s1.close();

    const s2 = new SqliteJobStore({ sqlitePath: path, ttlHours: 24 });
    const fetched = s2.get(job.job_id);
    expect(fetched?.upid).toBe("UPID:abc");
    expect(fetched?.status).toBe("running");
    s2.close();
  });

  it("records upid changes", () => {
    const store = makeStore();
    const job = store.create({ tool: "create_vm", args: {}, node: "pve" });
    store.setUpid(job.job_id, "UPID:first");
    store.setUpid(job.job_id, "UPID:second");
    const updated = store.get(job.job_id);
    expect(updated?.upid).toBe("UPID:second");
    expect(updated?.previous_upids).toEqual(["UPID:first"]);
    store.close();
  });

  it("filters list by status and tool", () => {
    const store = makeStore();
    const j1 = store.create({ tool: "create_vm", args: {}, node: "pve" });
    const j2 = store.create({ tool: "delete_vm", args: {}, node: "pve" });
    store.update(j2.job_id, { status: "failed" });

    expect(store.list({ status: "queued" }).map((j) => j.job_id)).toEqual([j1.job_id]);
    expect(store.list({ status: "failed" }).map((j) => j.job_id)).toEqual([j2.job_id]);
    expect(store.list({ tool: "create_vm" }).map((j) => j.job_id)).toEqual([j1.job_id]);
    store.close();
  });

  it("scrubs secrets in stored args", () => {
    const store = makeStore();
    const job = store.create({
      tool: "create_container",
      args: { password: "supersecret", hostname: "test" },
      node: "pve",
    });
    expect(job.args.password).toBe("[REDACTED]");
    expect(job.args.hostname).toBe("test");

    // Confirm persistence also scrubs
    const fetched = store.get(job.job_id);
    expect(fetched?.args.password).toBe("[REDACTED]");
    store.close();
  });

  it("evicts expired jobs", () => {
    const store = makeStore();
    const old = store.create({ tool: "x", args: {}, node: "pve" });
    // Backdate started_at to 25h ago
    store.update(old.job_id, { started_at: Date.now() - 25 * 60 * 60 * 1000 });
    expect(store.get(old.job_id)).not.toBeNull();
    const removed = store.evictExpired();
    expect(removed).toBe(1);
    expect(store.get(old.job_id)).toBeNull();
    store.close();
  });

  it("deletes jobs", () => {
    const store = makeStore();
    const job = store.create({ tool: "x", args: {}, node: "pve" });
    expect(store.delete(job.job_id)).toBe(true);
    expect(store.get(job.job_id)).toBeNull();
    store.close();
  });

  it("applies schema migrations idempotently", () => {
    const path = join(tmpDir, "migrate.sqlite3");
    // Create twice — second open should be no-op
    const s1 = new SqliteJobStore({ sqlitePath: path, ttlHours: 24 });
    s1.close();
    const s2 = new SqliteJobStore({ sqlitePath: path, ttlHours: 24 });
    s2.create({ tool: "x", args: {}, node: "pve" });
    s2.close();
  });
});