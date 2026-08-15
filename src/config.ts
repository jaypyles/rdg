export const config = {
  host: Bun.env.RDG_HOST ?? "0.0.0.0",
  port: Number(Bun.env.RDG_PORT ?? "6005"),
  token: Bun.env.RDG_TOKEN,
  composeRepo: Bun.env.RDG_COMPOSE_REPO,
  composeBranch: Bun.env.RDG_COMPOSE_BRANCH ?? "main",
  composePath: Bun.env.RDG_COMPOSE_PATH ?? "nodes/{node}",
  gitToken: Bun.env.RDG_GIT_TOKEN?.trim() || undefined,
  syncIntervalMs: Number(Bun.env.RDG_SYNC_INTERVAL_MS ?? "60000"),
} as const;
