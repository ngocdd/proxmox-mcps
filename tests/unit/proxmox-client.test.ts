import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nock from "nock";
import { ProxmoxClient } from "../../src/proxmox/client.js";
import { NotFoundError, PermissionDeniedError, AuthenticationError } from "../../src/proxmox/errors.js";

const HOST = "pve.test.local";
const PORT = 8006;

function makeClient(opts: { verifySsl?: boolean; max?: number } = {}) {
  return new ProxmoxClient({
    proxmox: {
      host: HOST,
      port: PORT,
      user: "root@pam",
      tokenName: "mcp",
      tokenValue: "00000000-0000-0000-0000-000000000000",
      verifySsl: opts.verifySsl ?? true,
      timeoutMs: 5000,
      service: "PVE",
    },
    retry: { max: opts.max ?? 0, baseMs: 10 },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as never,
  });
}

describe("ProxmoxClient", () => {
  beforeEach(() => {
    nock.cleanAll();
  });
  afterEach(() => {
    nock.cleanAll();
  });

  it("sends GET with correct Authorization header and unwraps data", async () => {
    const scope = nock(`https://${HOST}:${PORT}`)
      .get("/api2/json/cluster/status")
      .matchHeader("authorization", "PVEAPIToken=root@pam!mcp=00000000-0000-0000-0000-000000000000")
      .reply(200, { data: { name: "test-cluster", quorate: 1 } });

    const client = makeClient();
    const result = await client.get("/cluster/status");
    expect(result).toEqual({ name: "test-cluster", quorate: 1 });
    expect(scope.isDone()).toBe(true);
  });

  it("POST sends form-encoded body and unwraps UPID", async () => {
    const scope = nock(`https://${HOST}:${PORT}`)
      .post("/api2/json/nodes/pve/qemu/100/status/start")
      .matchHeader("content-type", /application\/x-www-form-urlencoded/)
      .reply(200, { data: "UPID:pve:000B5C66:1234:56" });

    const client = makeClient();
    const result = await client.post<string>("/nodes/pve/qemu/100/status/start");
    expect(result).toBe("UPID:pve:000B5C66:1234:56");
    expect(scope.isDone()).toBe(true);
  });

  it("maps 404 to NotFoundError", async () => {
    nock(`https://${HOST}:${PORT}`)
      .get("/api2/json/nodes/pve/qemu/999/config")
      .reply(404, { errors: { vmid: "does not exist" } });

    const client = makeClient();
    await expect(client.get("/nodes/pve/qemu/999/config")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps 401 to AuthenticationError", async () => {
    nock(`https://${HOST}:${PORT}`)
      .get("/api2/json/cluster/status")
      .reply(401, "invalid ticket");

    const client = makeClient();
    await expect(client.get("/cluster/status")).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("maps 403 to PermissionDeniedError", async () => {
    nock(`https://${HOST}:${PORT}`)
      .get("/api2/json/access/users")
      .reply(403, { message: "permission denied" });

    const client = makeClient();
    await expect(client.get("/access/users")).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("retries on transient 5xx then succeeds", async () => {
    const scope = nock(`https://${HOST}:${PORT}`)
      .get("/api2/json/cluster/status")
      .reply(503, "service unavailable")
      .get("/api2/json/cluster/status")
      .reply(200, { data: { ok: 1 } });

    const client = makeClient({ max: 2 });
    const result = await client.get("/cluster/status");
    expect(result).toEqual({ ok: 1 });
    expect(scope.isDone()).toBe(true);
  });

  it("does not retry on 4xx (other than 429)", async () => {
    let calls = 0;
    nock(`https://${HOST}:${PORT}`)
      .get("/api2/json/cluster/status")
      .times(1)
      .reply(403, { message: "no" });

    const client = makeClient({ max: 3 });
    try {
      await client.get("/cluster/status");
    } catch {
      calls++;
    }
    expect(calls).toBe(1);
  });

  it("PUT sends body and unwraps data", async () => {
    const scope = nock(`https://${HOST}:${PORT}`)
      .put("/api2/json/nodes/pve/qemu/100/resize")
      .query({ disk: "scsi0" })
      .reply(200, { data: "UPID:..." });

    const client = makeClient();
    const result = await client.put<string>("/nodes/pve/qemu/100/resize?disk=scsi0", { size: "+10G" });
    expect(result).toBe("UPID:...");
    expect(scope.isDone()).toBe(true);
  });

  it("DELETE with params", async () => {
    const scope = nock(`https://${HOST}:${PORT}`)
      .delete("/api2/json/nodes/pve/qemu/100")
      .query({ force: 1 })
      .reply(200, { data: "UPID:delete" });

    const client = makeClient();
    const result = await client.delete<string>("/nodes/pve/qemu/100", { force: 1 });
    expect(result).toBe("UPID:delete");
    expect(scope.isDone()).toBe(true);
  });
});