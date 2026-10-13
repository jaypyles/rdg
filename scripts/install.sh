#!/usr/bin/env bash
# Pipeable installer. From a Debian host:
#   curl -fsSL https://raw.githubusercontent.com/jaypyles/rdg/main/scripts/install.sh | sudo bash
#
# Run as your login user (recommended when using rclone / home volumes):
#   curl -fsSL .../install.sh | sudo RDG_SERVICE_USER=jayden bash
#
# Override the clone source:
#   curl -fsSL .../install.sh | sudo RDG_INSTALL_REPO=https://github.com/<owner>/rdg.git bash
set -euo pipefail

: "${RDG_INSTALL_REPO:=https://github.com/jaypyles/rdg.git}"
: "${RDG_INSTALL_BRANCH:=main}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: curl -fsSL <install.sh url> | sudo bash" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

git clone --depth 1 --branch "${RDG_INSTALL_BRANCH}" "${RDG_INSTALL_REPO}" "${WORKDIR}/src"

# Preserve service-user overrides for the debian installer.
export RDG_SERVICE_USER="${RDG_SERVICE_USER:-rdg}"
export RDG_SERVICE_GROUP="${RDG_SERVICE_GROUP:-${RDG_SERVICE_USER}}"

bash "${WORKDIR}/src/scripts/install-debian.sh"
