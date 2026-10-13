export const config = {
  host: Bun.env.RDG_HOST ?? "0.0.0.0",
  port: Number(Bun.env.RDG_PORT ?? "6005"),
  token: Bun.env.RDG_TOKEN,
  composeRepo: Bun.env.RDG_COMPOSE_REPO,
  composeBranch: Bun.env.RDG_COMPOSE_BRANCH ?? "main",
  composePath: Bun.env.RDG_COMPOSE_PATH ?? "nodes/{node}",
  configPath: Bun.env.RDG_CONFIG_PATH ?? "config/{node}",
  sharedPath: Bun.env.RDG_SHARED_PATH ?? "shared",
  gitToken: Bun.env.RDG_GIT_TOKEN?.trim() || undefined,
  syncIntervalMs: Number(Bun.env.RDG_SYNC_INTERVAL_MS ?? "60000"),
  /** Local hour for daily maintenance (stop/start stacks). Set < 0 to disable. */
  maintenanceHour: Number(Bun.env.RDG_MAINTENANCE_HOUR ?? "3"),
  maintenanceMinute: Number(Bun.env.RDG_MAINTENANCE_MINUTE ?? "0"),
  /** Shell command run between stop and start (e.g. rclone sync ...). */
  maintenanceCmd: Bun.env.RDG_MAINTENANCE_CMD?.trim() || undefined,
} as const;
