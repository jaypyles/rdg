#!/usr/bin/env bash
set -euo pipefail

APP_NAME="remote-docker-gateway"
APP_USER="rdg"
APP_DIR="/opt/${APP_NAME}"
ENV_FILE="/etc/${APP_NAME}.env"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
BUN_BIN="/usr/local/bin/bun"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl unzip rsync git

if [[ ! -x "${BUN_BIN}" ]]; then
  curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

if getent group docker >/dev/null; then
  usermod -aG docker "${APP_USER}"
fi

mkdir -p "${APP_DIR}"
rsync -a --delete \
  --exclude "node_modules" \
  --exclude ".git" \
  --exclude ".config" \
  "${SOURCE_DIR}/" "${APP_DIR}/"

cd "${APP_DIR}"
"${BUN_BIN}" install --frozen-lockfile --production

if [[ ! -f "${ENV_FILE}" ]]; then
  install -m 640 -o root -g "${APP_USER}" "${APP_DIR}/deploy/${APP_NAME}.env" "${ENV_FILE}"
fi

install -m 644 "${APP_DIR}/deploy/${APP_NAME}.service" "${SERVICE_FILE}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

systemctl daemon-reload
systemctl enable "${APP_NAME}.service"
systemctl restart "${APP_NAME}.service"
systemctl --no-pager --full status "${APP_NAME}.service"
