#!/usr/bin/env bash
# Install / upgrade the gateway as a systemd service.
#
# Run as your own user (rclone + home volumes work as-is):
#   sudo RDG_SERVICE_USER=jayden bash scripts/install-debian.sh
#
# Default system user:
#   sudo bash scripts/install-debian.sh
set -euo pipefail

APP_NAME="remote-docker-gateway"
APP_DIR="/opt/${APP_NAME}"
ETC_DIR="/etc/${APP_NAME}"
ENV_FILE="/etc/${APP_NAME}.env"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
BUN_BIN="/usr/local/bin/bun"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SERVICE_USER="${RDG_SERVICE_USER:-rdg}"
SERVICE_GROUP="${RDG_SERVICE_GROUP:-${SERVICE_USER}}"

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

if ! command -v rclone >/dev/null 2>&1; then
  curl -fsSL https://rclone.org/install.sh | bash
fi

if [[ "${SERVICE_USER}" == "rdg" ]]; then
  if ! id -u rdg >/dev/null 2>&1; then
    useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin rdg
  fi
elif ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  echo "RDG_SERVICE_USER does not exist: ${SERVICE_USER}" >&2
  exit 1
fi

if ! getent group "${SERVICE_GROUP}" >/dev/null; then
  echo "RDG_SERVICE_GROUP does not exist: ${SERVICE_GROUP}" >&2
  exit 1
fi

if getent group docker >/dev/null; then
  usermod -aG docker "${SERVICE_USER}"
fi

mkdir -p "${APP_DIR}" "${ETC_DIR}"
rsync -a --delete \
  --exclude "node_modules" \
  --exclude ".git" \
  --exclude ".config" \
  "${SOURCE_DIR}/" "${APP_DIR}/"

cd "${APP_DIR}"
"${BUN_BIN}" install --frozen-lockfile --production

if [[ ! -f "${ENV_FILE}" ]]; then
  install -m 640 -o root -g "${SERVICE_GROUP}" \
    "${APP_DIR}/deploy/${APP_NAME}.env" "${ENV_FILE}"
fi

# Drop RCLONE_CONFIG overrides when running as a real user — rclone
# will use ~/.config/rclone/rclone.conf automatically.
if [[ "${SERVICE_USER}" != "rdg" ]]; then
  if grep -q '^RCLONE_CONFIG=' "${ENV_FILE}"; then
    sed -i '/^RCLONE_CONFIG=/d' "${ENV_FILE}"
  fi
fi

SERVICE_HOME="$(getent passwd "${SERVICE_USER}" | cut -d: -f6)"
if [[ -z "${SERVICE_HOME}" ]]; then
  echo "Could not resolve home for ${SERVICE_USER}" >&2
  exit 1
fi

# ReadWritePaths must include the user home so rclone can update tokens/cache
# under ProtectSystem=strict.
READ_WRITE_PATHS="${APP_DIR}"
if [[ "${SERVICE_HOME}" != "${APP_DIR}" ]]; then
  READ_WRITE_PATHS="${APP_DIR} ${SERVICE_HOME}"
fi

sed \
  -e "s/^User=.*/User=${SERVICE_USER}/" \
  -e "s/^Group=.*/Group=${SERVICE_GROUP}/" \
  -e "s|^ReadWritePaths=.*|ReadWritePaths=${READ_WRITE_PATHS}|" \
  "${APP_DIR}/deploy/${APP_NAME}.service" > "${SERVICE_FILE}"

# HOME = real user home (rclone). XDG_CONFIG_HOME stays under APP_DIR
# (set in the unit) so node.json / compose cache survive user changes.
if ! grep -q '^Environment=HOME=' "${SERVICE_FILE}"; then
  sed -i "/^Environment=XDG_CONFIG_HOME=/a Environment=HOME=${SERVICE_HOME}" "${SERVICE_FILE}"
fi

chmod 644 "${SERVICE_FILE}"

chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${APP_DIR}"

echo "Installing ${APP_NAME} to run as ${SERVICE_USER}:${SERVICE_GROUP}"
echo "  HOME=${SERVICE_HOME}"
echo "  XDG_CONFIG_HOME=${APP_DIR}/.config"

systemctl daemon-reload
systemctl enable "${APP_NAME}.service"
systemctl restart "${APP_NAME}.service"

echo "---"
systemctl show "${APP_NAME}.service" -p User -p Group -p Environment --no-pager
echo "---"
systemctl --no-pager --full status "${APP_NAME}.service"
