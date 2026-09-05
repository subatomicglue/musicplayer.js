#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PORT="${1:-8000}"

echo "Serving ${SCRIPT_DIR} at http://localhost:${PORT}/"
exec python3 -m http.server "${PORT}" --bind 127.0.0.1 --directory "${SCRIPT_DIR}"
