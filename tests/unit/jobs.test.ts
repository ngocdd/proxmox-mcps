import { describe, expect, it } from "vitest";
import { InMemoryJobStore } from "../../src/jobs/store.js";

describe("InMemoryJobStore", () => {
  it("creates jobs and returns them by id", () => {
    const store = new InMemoryJobStore({ ttlHours: 24 });
    const job = store.create({ tool: "create_vm", args: { vmid: "100" }, node: "pve" });
    expect(job.tool).toBe("create_vm");
    expect(job.status).toBe("queued");
    expect(store.get(job.job_id)).toEqual(job);
  });

  it("records upid and marks running", () => {
    const store = new InMemoryJobStore({ ttlHours: 24 });
    const job = store.create({ tool: "create_vm", args: {}, node: "pve" });
    store.setUpid(job.job_id, "UPID:pve:1");
    const updated = store.get(job.job_id);
    expect(updated?.upid).toBe("UPID:pve:1");
    expect(updated?.status).toBe("running");
  });

  it("preserves prior upid in previous_upids on retry", () => {
    const store = new InMemoryJobStore({ ttlHours: 24 });
    const job = store.create({ tool: "create_vm", args: {}, node: "pve" });
    store.setUpid(job.job_id, "UPID:first");
    store.setUpid(job.job_id, "UPID:second");
    const updated = store.get(job.job_id);
    expect(updated?.upid).toBe("UPID:second");
    expect(updated?.previous_upids).toEqual(["UPID:first"]);
  });

  it("lists jobs filtered by status and tool", () => {
    const store = new InMemoryJobStore({ ttlHours: 24 });
    const j1 = store.create({ tool: "create_vm", args: {}, node: "pve" });
    const j2 = store.create({ tool: "delete_vm", args: {}, node: "pve" });
    // j1 stays queued (no upid), j2 updated to failed
    store.update(j2.job_id, { status: "failed" });

    const queued = store.list({ status: "queued" });
    expect(queued.length).toBe(1);
    expect(queued[0]?.job_id).toBe(j1.job_id);

    const failed = store.list({ status: "failed" });
    expect(failed.length).toBe(1);
    expect(failed[0]?.job_id).toBe(j2.job_id);

    const tool = store.list({ tool: "create_vm" });
    expect(tool.length).toBe(1);
    expect(tool[0]?.job_id).toBe(j1.job_id);
  });

  it("scrubs secrets from stored args", () => {
    const store = new InMemoryJobStore({ ttlHours: 24 });
    const job = store.create({
      tool: "create_container",
      args: { password: "supersecret", hostname: "test" },
      node: "pve",
    });
    expect(job.args.password).toBe("[REDACTED]");
    expect(job.args.hostname).toBe("test");
  });
});