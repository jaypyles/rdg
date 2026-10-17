#!/usr/bin/env bash
# Archive volumes into a local backups folder and keep the last N dated tars.
# Optional Discord notify: set DISCORD_WEBHOOK_URL in the environment.
#
# RDG_MAINTENANCE_CMD=/home/jayden/scripts/backup.sh
set -euo pipefail

VOLUMES_DIR="${VOLUMES_DIR:-/home/jayden/volumes}"
BACKUP_DIR="${BACKUP_DIR:-/home/jayden/backups}"
KEEP="${KEEP:-5}"
PREFIX="${PREFIX:-volumes}"
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

DATE="$(date +%Y-%m-%d)"
ARCHIVE="${BACKUP_DIR}/${PREFIX}-${DATE}.tar.gz"
HOST="$(hostname -s 2>/dev/null || hostname)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH="$(date +%s)"
ARCHIVE_SIZE="n/a"

json_escape() {
  local s=${1-}
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

discord_embed() {
  local title=$1
  local description=$2
  local color=$3

  if [[ -z "${DISCORD_WEBHOOK_URL}" ]]; then
    return 0
  fi

  local elapsed=$(( $(date +%s) - START_EPOCH ))
  local mins=$((elapsed / 60))
  local secs=$((elapsed % 60))
  local size="${ARCHIVE_SIZE}"

  if [[ "${size}" == "n/a" && -f "${ARCHIVE}" ]]; then
    size="$(du -h "${ARCHIVE}" | awk '{print $1}')"
  fi

  local payload
  payload="$(cat <<EOF
{
  "embeds": [{
    "title": "$(json_escape "${title}")",
    "description": "$(json_escape "${description}")",
    "color": ${color},
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "fields": [
      {"name": "Host", "value": "$(json_escape "${HOST}")", "inline": true},
      {"name": "Duration", "value": "${mins}m ${secs}s", "inline": true},
      {"name": "Size", "value": "$(json_escape "${size}")", "inline": true},
      {"name": "Archive", "value": "$(json_escape "${ARCHIVE}")", "inline": false},
      {"name": "Started", "value": "$(json_escape "${STARTED_AT}")", "inline": true},
      {"name": "Keep", "value": "${KEEP} backups", "inline": true}
    ]
  }]
}
EOF
)"

  if ! curl -fsS -H 'Content-Type: application/json' -d "${payload}" "${DISCORD_WEBHOOK_URL}" >/dev/null; then
    echo "warning: discord webhook failed" >&2
  fi
}

on_error() {
  local code=$?
  discord_embed "Backup failed" "Exit code ${code} on ${HOST}" 15158332
  exit "${code}"
}

trap on_error ERR

if [[ ! -d "${VOLUMES_DIR}" ]]; then
  echo "volumes dir not found: ${VOLUMES_DIR}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

PARENT="$(dirname "${VOLUMES_DIR}")"
NAME="$(basename "${VOLUMES_DIR}")"

echo "archiving ${VOLUMES_DIR} -> ${ARCHIVE}"
tar -C "${PARENT}" -czf "${ARCHIVE}" "${NAME}"

ARCHIVE_SIZE="$(du -h "${ARCHIVE}" | awk '{print $1}')"
echo "archive ready (${ARCHIVE_SIZE}): ${ARCHIVE}"

echo "pruning ${BACKUP_DIR} to last ${KEEP} ${PREFIX}-*.tar.gz"
mapfile -t OLD < <(
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name "${PREFIX}-*.tar.gz" -printf '%f\n' \
    | sort -r \
    | tail -n "+$((KEEP + 1))"
)

DELETED=0
for file in "${OLD[@]:-}"; do
  [[ -z "${file}" ]] && continue
  echo "deleting ${BACKUP_DIR}/${file}"
  rm -f "${BACKUP_DIR}/${file}"
  DELETED=$((DELETED + 1))
done

echo "backup complete"

discord_embed \
  "Backup complete" \
  "Wrote **${PREFIX}-${DATE}.tar.gz** (${ARCHIVE_SIZE}) to ${BACKUP_DIR}. Pruned ${DELETED} old backup(s)." \
  5763719
