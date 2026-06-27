/**
 * Proxmox API authentication helpers.
 *
 * API token format: PVEAPIToken=<user>@<realm>!<tokenname>=<token-value>
 * See: https://pve.proxmox.com/pve-docs/api-viewer/#/access/users/userid/token
 */

/**
 * Construct the full token string used in the Authorization header.
 *
 * @example
 * buildPveApiToken("root@pam", "mcp", "abc-def-...")
 * // => "root@pam!mcp=abc-def-..."
 */
export function buildPveApiToken(user: string, tokenName: string, tokenValue: string): string {
  return `${user}!${tokenName}=${tokenValue}`;
}

/**
 * Construct the full Authorization header value.
 *
 * @example
 * authHeader("root@pam", "mcp", "abc-def-...")
 * // => "PVEAPIToken=root@pam!mcp=abc-def-..."
 */
export function authHeader(user: string, tokenName: string, tokenValue: string): string {
  return `PVEAPIToken=${buildPveApiToken(user, tokenName, tokenValue)}`;
}

/**
 * Extract the user portion from an API token string (sanity check / display).
 *
 * @example
 * parseTokenUser("root@pam!mcp=abc-def") => "root@pam"
 */
export function parseTokenUser(tokenStr: string): string | null {
  const bang = tokenStr.indexOf("!");
  if (bang < 0) return null;
  return tokenStr.slice(0, bang);
}