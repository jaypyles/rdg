# Remote Docker Gateway

Bun service that runs on each Docker host. Compose files in git are the source of truth; this process is the remote interface: register the node, pull, `docker compose up`, inspect, restart, logs.

## Development

```bash
bun install
bun run dev
```

CLI (`rdg`). From this repo, link it onto your PATH (`~/.bun/bin` must be on `PATH`):

```bash
bun link
rdg --help
```

On a laptop, save gateways in `~/.config/rdg/hosts.json` and run commands against them:

```bash
rdg host add media http://192.168.1.10:6005 --token secret
rdg host add other http://192.168.1.11:6005
rdg host use media
rdg sync
rdg -H other ps
rdg -H media restart nginx
rdg logs nginx --tail 100
```

`--host` / `-H` selects an alias. If omitted, the default host is used. `--local` talks to this machine instead (the gateway process, `node.json`, compose clone).

```bash
rdg serve
rdg register media --local
rdg sync --local
```

Copy `.env.example` to `.env`. Set `RDG_COMPOSE_REPO` to the git URL that contains per-node Compose files.

Layout expected in that repo (override with `RDG_COMPOSE_PATH` / `RDG_CONFIG_PATH` / `RDG_SHARED_PATH`):

```text
nodes/media/jellyfin.yaml
nodes/media/jellyseerr.yaml
nodes/otherhost/stack.yaml
config/media/nginx/nginx.conf
config/media/jellyfin/encoding.xml
shared/watchtower.yaml
shared/cadvisor/compose.yaml
```

Each `*.yaml` / `*.yml` in the node directory is its own Compose project (`rdg-<node>-<filename>`). A commit that only changes `jellyfin.yaml` only redeploys that stack.

Files under `shared/` are applied on **every** node (`rdg-<node>-shared-<service>`). Use either `shared/<service>.yaml` or `shared/<service>/*.yaml`. A commit that only changes a shared stack updates that stack on all hosts; it does not redeploy per-node stacks.

Per-service files live under `config/<node>/<service>/`. Compose interpolates `RDG_CONFIG` (absolute path to `config/<node>` on the host) so you can bind-mount them:

```yaml
services:
  nginx:
    image: nginx:alpine
    volumes:
      - ${RDG_CONFIG}/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
```

A commit that only changes `config/media/nginx/...` restarts the `nginx` service on that node; it does not redeploy unrelated stacks.

An example stack lives in `examples/nodes/media/compose.yaml`.

Register this machine, then sync:

```bash
curl -X POST http://127.0.0.1:6005/node -H 'content-type: application/json' -d '{"name":"media"}'
curl -X POST http://127.0.0.1:6005/sync
```

If `RDG_TOKEN` is set, send `Authorization: Bearer <token>` on all routes except `/` and `/health`.

| Method | Path                            | Purpose                                                   |
| ------ | ------------------------------- | --------------------------------------------------------- |
| GET    | `/health`                       | Liveness                                                  |
| GET    | `/node`                         | Registered node name                                      |
| POST   | `/node`                         | Register this host                                        |
| POST   | `/sync`                         | Fetch git; `compose up` only if this node's files changed |
| GET    | `/ps`                           | `docker compose ps`                                       |
| POST   | `/restart`                      | Restart every stack on this node                          |
| POST   | `/services/:name/restart`       | Restart one service                                       |
| GET    | `/services/:name/logs?tail=100` | Service logs                                              |

On an interval (`RDG_SYNC_INTERVAL_MS`, default 60s) the process caches the last commit, fetches the repo, and if `origin/<branch>` moved, diffs files. It only runs `docker compose up -d --remove-orphans` when this node's compose files or a shared stack changed, and `docker compose restart <service>` when that service's files under `config/<node>/<service>/` changed. Set the interval to `0` to disable the schedule. Manual `POST /sync` still works.

## Debian systemd install

From a repo checkout:

```bash
sudo bash scripts/install-debian.sh
```

Or SSH onto a host and install in one shot (after this repo is on GitHub):

```bash
curl -fsSL https://raw.githubusercontent.com/jaypyles/rdg/main/scripts/install.sh | sudo bash
```

```bash
sudo systemctl restart remote-docker-gateway
```

The unit runs as `rdg` in the `docker` group.
