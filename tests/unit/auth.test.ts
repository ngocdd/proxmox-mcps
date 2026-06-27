import { describe, expect, it } from "vitest";
import { authHeader, buildPveApiToken, parseTokenUser } from "../../src/proxmox/auth.js";

describe("auth helpers", () => {
  it("builds a PVEAPIToken string", () => {
    expect(buildPveApiToken("root@pam", "mcp", "abc-123")).toBe("root@pam!mcp=abc-123");
  });

  it("builds a full Authorization header value", () => {
    expect(authHeader("root@pam", "mcp", "abc-123")).toBe(
      "PVEAPIToken=root@pam!mcp=abc-123",
    );
  });

  it("parses the user from a token string", () => {
    expect(parseTokenUser("root@pam!mcp=abc-123")).toBe("root@pam");
  });

  it("returns null for malformed token strings", () => {
    expect(parseTokenUser("no-bang-here")).toBeNull();
  });
});