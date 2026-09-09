#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PORT="${1:-8000}"

echo "Serving ${SCRIPT_DIR} on all interfaces, port ${PORT}"
echo "Open http://<this-computer's-LAN-IP>:${PORT}/ from another device"
exec python3 -m http.server "${PORT}" --bind 0.0.0.0 --directory "${SCRIPT_DIR}"
