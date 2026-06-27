/**
 * Tool helper functions shared across tool files.
 */
import type { JobRecord } from "../jobs/store.js";
import type { ToolContext } from "./context.js";

export interface TrackUpidOpts {
  node: string;
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Register a tracked job for a Proxmox UPID returned by a long-running call.
 */
export function trackUpid(ctx: ToolContext, upid: string, opts: TrackUpidOpts): JobRecord {
  return ctx.jobs.create({ ...opts, upid });
}