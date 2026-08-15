# Remote Docker Gateway

Bun service that runs on each Docker host. Compose files in git are the source of truth; this process is the remote interface: register the node, pull, `docker compose up`, inspect, restart, logs.

## Development

```bash
bun install
bun run dev
```

Copy `.env.example` to `.env`. Set `RDG_COMPOSE_REPO` to the git URL that contains per-node Compose files.

Layout expected in that repo (override with `RDG_COMPOSE_PATH`):

```text
nodes/media/compose.yaml
```

An example stack lives in `examples/nodes/media/compose.yaml`.

Register this machine, then sync:

```bash
curl -X POST http://127.0.0.1:6005/node -H 'content-type: application/json' -d '{"name":"media"}'
curl -X POST http://127.0.0.1:6005/sync
```

If `RDG_TOKEN` is set, send `Authorization: Bearer <token>` on all routes except `/` and `/health`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/node` | Registered node name |
| POST | `/node` | Register this host |
| POST | `/sync` | Fetch git; `compose up` only if this node's files changed |
| GET | `/ps` | `docker compose ps` |
| POST | `/services/:name/restart` | Restart one service |
| GET | `/services/:name/logs?tail=100` | Service logs |

On an interval (`RDG_SYNC_INTERVAL_MS`, default 60s) the process caches the last commit, fetches the repo, and if `origin/<branch>` moved, diffs files. It only runs `docker compose up -d --remove-orphans` when this node's compose path (or anything in that directory) changed. Set the interval to `0` to disable the schedule. Manual `POST /sync` still works.

## Debian systemd install

From a repo checkout:

```bash
sudo bash scripts/install-debian.sh
```

Or SSH onto a host and install in one shot (after this repo is on GitHub):

```bash
curl -fsSL https://raw.githubusercontent.com/jaydenpyles/remote-docker-gateway/main/scripts/install.sh | sudo bash
```

If the repo URL is different:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/remote-docker-gateway/main/scripts/install.sh \
  | sudo RDG_INSTALL_REPO=https://github.com/<owner>/remote-docker-gateway.git bash
```

That clones the repo, installs Bun, copies the app to `/opt/remote-docker-gateway`, and enables the systemd unit. Then edit `/etc/remote-docker-gateway.env` (compose repo, tokens, node settings) and restart:

```bash
sudo systemctl restart remote-docker-gateway
```

The unit runs as `rdg` in the `docker` group.
