import { describe, expect, it } from "vitest";
import {
  errorResult,
  jsonResult,
  ok,
  errResult,
  tableResult,
  toJson,
} from "../../src/format/response.js";
import { ZodError } from "zod";
import { ProxmoxApiError, NotFoundError, ApprovalRequiredError } from "../../src/proxmox/errors.js";

describe("format helpers", () => {
  it("ok returns text content", () => {
    expect(ok("hello")).toEqual({ content: [{ type: "text", text: "hello" }] });
  });

  it("errResult marks isError", () => {
    expect(errResult("boom")).toEqual({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    });
  });

  it("jsonResult wraps in markdown", () => {
    const r = jsonResult("Result:", { a: 1 });
    expect(r.content[0]?.text).toContain("```json");
    expect(r.content[0]?.text).toContain('"a": 1');
  });

  it("toJson produces stable output", () => {
    expect(toJson({ b: 2, a: 1 })).toBe('{\n  "b": 2,\n  "a": 1\n}');
  });

  it("tableResult renders aligned columns", () => {
    const r = tableResult("VMs:", [
      { vmid: "100", name: "web" },
      { vmid: "101", name: "db" },
    ]);
    expect(r.content[0]?.text).toContain("vmid");
    expect(r.content[0]?.text).toContain("100");
    expect(r.content[0]?.text).toContain("web");
  });

  it("tableResult handles empty array", () => {
    const r = tableResult("VMs:", []);
    expect(r.content[0]?.text).toContain("(empty)");
  });

  it("errorResult maps ZodError", () => {
    const err = new ZodError([
      { code: "invalid_type", expected: "string", path: ["node"], message: "Required" },
    ]);
    const r = errorResult(err);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("node");
    expect(r.content[0]?.text).toContain("Required");
  });

  it("errorResult maps ProxmoxApiError with field details", () => {
    const err = new ProxmoxApiError({
      status: 400,
      message: "Bad request",
      errors: { vmid: "must be numeric" },
      path: "/qemu",
    });
    const r = errorResult(err);
    expect(r.content[0]?.text).toContain("vmid=must be numeric");
    expect(r.content[0]?.text).toContain("400");
  });

  it("errorResult maps NotFoundError", () => {
    const r = errorResult(new NotFoundError("/qemu"));
    expect(r.content[0]?.text).toContain("404");
  });

  it("errorResult maps ApprovalRequiredError with hint", () => {
    const r = errorResult(new ApprovalRequiredError("delete_vm", "destructive"));
    expect(r.content[0]?.text).toContain("approval_token");
    expect(r.content[0]?.text).toContain("PROXMOX_DANGEROUSLY_ALLOW_DESTRUCTIVE");
  });

  it("errorResult maps generic Error", () => {
    const r = errorResult(new Error("plain failure"));
    expect(r.content[0]?.text).toContain("plain failure");
  });

  it("errorResult maps unknown thrown value", () => {
    const r = errorResult({ unexpected: "object" });
    expect(r.isError).toBe(true);
  });
});