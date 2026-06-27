/**
 * Shared contract tests — both InMemoryJobStore and SqliteJobStore must
 * satisfy the same behavior. This ensures the two implementations are
 * drop-in interchangeable (a Phase 2 deliverable).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryJobStore } from "../../src/jobs/store.js";
import { SqliteJobStore } from "../../src/jobs/sqlite-store.js";
import type { JobStore } from "../../src/jobs/store.js";

interface Factory {
  name: string;
  create: () => JobStore & { close?: () => void };
  cleanup: () => void;
}

describe.each<Factory>([
  {
    name: "InMemoryJobStore",
    create: () => new InMemoryJobStore({ ttlHours: 24 }),
    cleanup: () => {},
  },
  {
    name: "SqliteJobStore",
    create: () => new SqliteJobStore({ sqlitePath: "", ttlHours: 24 }),
    cleanup: () => {},
  },
])("JobStore contract: $name", (factory) => {
  let store: JobStore;

  beforeEach(() => {
    if (factory.name === "SqliteJobStore") {
      const tmpDir = mkdtempSync(join(tmpdir(), "pve-job-contract-"));
      factory.create = () =>
        new SqliteJobStore({ sqlitePath: join(tmpDir, "jobs.sqlite3"), ttlHours: 24 });
      factory.cleanup = () => rmSync(tmpDir, { recursive: true, force: true });
    }
    store = factory.create();
  });

  afterEach(() => {
    const s = store as JobStore & { close?: () => void };
    if (typeof s.close === "function") s.close();
    factory.cleanup();
  });

  it("create() returns a JobRecord with job_id and started_at", () => {
    const job = store.create({ tool: "create_vm", args: {}, node: "pve" });
    expect(job.job_id).toBeTruthy();
    expect(job.tool).toBe("create_vm");
    expect(job.node).toBe("pve");
    expect(job.started_at).toBeGreaterThan(0);
    expect(job.status).toBe("queued");
  });

  it("create() with upid marks running immediately", () => {
    const job = store.create({ tool: "x", args: {}, node: "pve", upid: "UPID:abc" });
    expect(job.status).toBe("running");
    expect(job.upid).toBe("UPID:abc");
  });

  it("get() returns null for unknown job_id", () => {
    expect(store.get("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("setUpid() updates upid and marks running", () => {
    const job = store.create({ tool: "x", args: {}, node: "pve" });
    store.setUpid(job.job_id, "UPID:new");
    const after = store.get(job.job_id);
    expect(after?.upid).toBe("UPID:new");
    expect(after?.status).toBe("running");
  });

  it("setUpid() pushes prior upid to previous_upids", () => {
    const job = store.create({ tool: "x", args: {}, node: "pve" });
    store.setUpid(job.job_id, "UPID:first");
    store.setUpid(job.job_id, "UPID:second");
    const after = store.get(job.job_id);
    expect(after?.upid).toBe("UPID:second");
    expect(after?.previous_upids).toEqual(["UPID:first"]);
  });

  it("update() merges fields", () => {
    const job = store.create({ tool: "x", args: {}, node: "pve", upid: "UPID:abc" });
    store.update(job.job_id, { progress: 42, exit_status: "OK", ended_at: 1234567890 });
    const after = store.get(job.job_id);
    expect(after?.progress).toBe(42);
    expect(after?.exit_status).toBe("OK");
    expect(after?.ended_at).toBe(1234567890);
    // Other fields preserved
    expect(after?.upid).toBe("UPID:abc");
  });

  it("list() returns newest first", async () => {
    const j1 = store.create({ tool: "x", args: {}, node: "pve" });
    // ensure next job has a later timestamp
    await new Promise((r) => setTimeout(r, 2));
    const j2 = store.create({ tool: "y", args: {}, node: "pve" });
    const list = store.list();
    expect(list[0]?.job_id).toBe(j2.job_id);
    expect(list[1]?.job_id).toBe(j1.job_id);
  });

  it("list() filters by status", () => {
    const j1 = store.create({ tool: "x", args: {}, node: "pve" });
    const j2 = store.create({ tool: "y", args: {}, node: "pve", upid: "UPID:abc" });
    const queued = store.list({ status: "queued" });
    const running = store.list({ status: "running" });
    expect(queued.map((j) => j.job_id)).toContain(j1.job_id);
    expect(running.map((j) => j.job_id)).toContain(j2.job_id);
  });

  it("list() filters by tool", () => {
    const j1 = store.create({ tool: "create_vm", args: {}, node: "pve" });
    const j2 = store.create({ tool: "delete_vm", args: {}, node: "pve" });
    const list = store.list({ tool: "create_vm" });
    expect(list.length).toBe(1);
    expect(list[0]?.job_id).toBe(j1.job_id);
    expect(list[0]?.job_id).not.toBe(j2.job_id);
  });

  it("list() respects limit", () => {
    for (let i = 0; i < 5; i++) {
      store.create({ tool: `t${i}`, args: {}, node: "pve" });
    }
    expect(store.list({ limit: 2 }).length).toBe(2);
  });

  it("delete() removes the job", () => {
    const job = store.create({ tool: "x", args: {}, node: "pve" });
    expect(store.delete(job.job_id)).toBe(true);
    expect(store.get(job.job_id)).toBeNull();
  });

  it("delete() returns false for unknown id", () => {
    expect(store.delete("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("scrubs sensitive args at creation", () => {
    const job = store.create({
      tool: "create_container",
      args: { password: "supersecret", hostname: "test" },
      node: "pve",
    });
    expect(job.args.password).toBe("[REDACTED]");
    expect(job.args.hostname).toBe("test");

    const fetched = store.get(job.job_id);
    expect(fetched?.args.password).toBe("[REDACTED]");
    expect(fetched?.args.hostname).toBe("test");
  });

  it("stores retry_spec for re-invocation", () => {
    const job = store.create({
      tool: "create_vm",
      args: { vmid: "100", name: "web" },
      node: "pve",
    });
    expect(job.retry_spec).not.toBeNull();
    expect(job.retry_spec?.tool).toBe("create_vm");
    expect(job.retry_spec?.args).toMatchObject({ vmid: "100" });
  });

  it("evictExpired() removes old completed jobs", () => {
    const job = store.create({ tool: "x", args: {}, node: "pve" });
    // Backdate started_at
    store.update(job.job_id, { started_at: Date.now() - 25 * 60 * 60 * 1000 });
    const removed = store.evictExpired();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(store.get(job.job_id)).toBeNull();
  });
});