/**
 * Tool registration entrypoint.
 *
 * Imports every tool group and registers them on the McpServer instance.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context.js";

// Side-effect import: populates the risk registry
import "../safety/risk.js";

import { registerClusterTools } from "./cluster.js";
import { registerNodeTools } from "./node.js";
import { registerStorageTools } from "./storage.js";
import { registerTasksTools } from "./tasks.js";
import { registerJobsTools } from "./jobs.js";
import { registerSnapshotTools } from "./snapshot.js";
import { registerBackupTools } from "./backup.js";
import { registerIsoTools } from "./iso.js";
import { registerVmCrudTools } from "./vm/crud.js";
import { registerContainerCrudTools } from "./container/crud.js";
import { registerVmConfigTools } from "./vm/config.js";
import { registerContainerConfigTools } from "./container/config.js";
import { registerVmDiagnosticsTools } from "./vm/diagnostics.js";
import { registerContainerDiagnosticsTools } from "./container/diagnostics.js";
import { registerVmMigrationTools } from "./vm/migration.js";
import { registerContainerMigrationTools } from "./container/migration.js";
import { registerVmConsoleTools } from "./vm/console.js";
import { registerContainerConsoleTools } from "./container/console.js";
import { registerPoolTools } from "./pools.js";
import { registerHaTools } from "./ha.js";
import { registerBackupScheduleTools } from "./backup-schedule.js";
import { registerNodeAdminTools } from "./node-admin.js";
import { registerNodeServicesTools } from "./node-services.js";
import { registerNodeNetworkTools } from "./node-network.js";
import { registerNodeDisksTools } from "./node-disks.js";
import { registerNodeCertsTools } from "./node-certs.js";
import { registerStorageAdminTools } from "./storage-admin.js";
import { registerReplicationTools } from "./replication.js";
import { registerSdnTools } from "./sdn.js";

export function registerAll(server: McpServer, ctx: ToolContext): void {
  registerClusterTools(server, ctx);
  registerNodeTools(server, ctx);
  registerStorageTools(server, ctx);
  registerTasksTools(server, ctx);
  registerJobsTools(server, ctx);
  registerSnapshotTools(server, ctx);
  registerBackupTools(server, ctx);
  registerIsoTools(server, ctx);
  registerVmCrudTools(server, ctx);
  registerContainerCrudTools(server, ctx);
  registerVmConfigTools(server, ctx);
  registerContainerConfigTools(server, ctx);
  registerVmDiagnosticsTools(server, ctx);
  registerContainerDiagnosticsTools(server, ctx);
  registerVmMigrationTools(server, ctx);
  registerContainerMigrationTools(server, ctx);
  registerVmConsoleTools(server, ctx);
  registerContainerConsoleTools(server, ctx);
  // Phase 2B
  registerPoolTools(server, ctx);
  registerHaTools(server, ctx);
  registerBackupScheduleTools(server, ctx);
  // Phase 2C
  registerNodeAdminTools(server, ctx);
  registerNodeServicesTools(server, ctx);
  registerNodeNetworkTools(server, ctx);
  registerNodeDisksTools(server, ctx);
  registerNodeCertsTools(server, ctx);
  // Phase 2D
  registerStorageAdminTools(server, ctx);
  registerReplicationTools(server, ctx);
  registerSdnTools(server, ctx);
}