#!/usr/bin/env bash
# Archive volumes and upload to rclone remote, keeping the last N dated backups.
# Optional Discord notify: set DISCORD_WEBHOOK_URL.
#
# RDG_MAINTENANCE_CMD=/home/jayden/scripts/backup.sh
set -euo pipefail

VOLUMES_DIR="${VOLUMES_DIR:-/home/jayden/volumes}"
TMP_DIR="${TMP_DIR:-/home/jayden/tmp}"
REMOTE="${REMOTE:-gdrive:}"
KEEP="${KEEP:-5}"
PREFIX="${PREFIX:-volumes}"
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

# Normalize to "remote:" (no trailing slash).
REMOTE="${REMOTE%/}"
[[ "${REMOTE}" == *: ]] || REMOTE="${REMOTE}:"

DATE="$(date +%Y-%m-%d)"
ARCHIVE="${TMP_DIR}/${PREFIX}-${DATE}.tar.gz"
DEST="${REMOTE}${PREFIX}-${DATE}.tar.gz"
HOST="$(hostname -s 2>/dev/null || hostname)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH="$(date +%s)"

json_escape() {
  # Escape a string for JSON (no surrounding quotes).
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
  local size="${ARCHIVE_SIZE:-n/a}"

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
      {"name": "Destination", "value": "$(json_escape "${DEST}")", "inline": false},
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

mkdir -p "${TMP_DIR}"

PARENT="$(dirname "${VOLUMES_DIR}")"
NAME="$(basename "${VOLUMES_DIR}")"

echo "archiving ${VOLUMES_DIR} -> ${ARCHIVE}"
tar -C "${PARENT}" -czf "${ARCHIVE}" "${NAME}"

ARCHIVE_SIZE="$(du -h "${ARCHIVE}" | awk '{print $1}')"

echo "uploading ${ARCHIVE} -> ${DEST}"
rclone copyto "${ARCHIVE}" "${DEST}" \
  -P \
  -v \
  --stats 1m \
  --drive-chunk-size 256M \
  --buffer-size 64M \
  --transfers 1 \
  --checkers 1 \
  --retries 1 \
  --low-level-retries 3

echo "removing local archive ${ARCHIVE}"
rm -f "${ARCHIVE}"

echo "pruning ${REMOTE} to last ${KEEP} ${PREFIX}-*.tar.gz"
mapfile -t OLD < <(
  rclone lsf "${REMOTE}" --files-only \
    | grep "^${PREFIX}-.*\.tar\.gz$" \
    | sort -r \
    | tail -n "+$((KEEP + 1))"
)

DELETED=0
for file in "${OLD[@]:-}"; do
  [[ -z "${file}" ]] && continue
  echo "deleting ${REMOTE}${file}"
  rclone delete "${REMOTE}${file}"
  DELETED=$((DELETED + 1))
done

echo "backup complete"

# Size already removed locally — use captured value in embed fields via description.
discord_embed \
  "Backup complete" \
  "Uploaded **${PREFIX}-${DATE}.tar.gz** (${ARCHIVE_SIZE}) to ${DEST}. Pruned ${DELETED} old backup(s)." \
  5763719
