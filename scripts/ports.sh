#!/usr/bin/env bash
# Manage Magnum ports for running multiple instances in parallel.
#
# .env is the single source of truth. This script reads it, lets you
# change host-side ports and the docker compose project name, and
# rewrites the derived URLs (EXPO_PUBLIC_*, MARTIN_URL, CORS_ORIGINS)
# to match.
#
# Usage:
#   ./scripts/ports.sh                       show current settings
#   ./scripts/ports.sh show                  same
#   ./scripts/ports.sh set <name> <port>     set a single port
#   ./scripts/ports.sh shift <n>             add N to every host port
#   ./scripts/ports.sh project <name>        set COMPOSE_PROJECT_NAME
#   ./scripts/ports.sh reset                 restore .env.example defaults
#   ./scripts/ports.sh help                  show this help
#
# Recognised port names: api, martin, postgres, metro

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

ENV_FILE="$ROOT/.env"
EXAMPLE_FILE="$ROOT/.env.example"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
log()  { echo -e "${GREEN}[ports]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[err]${NC}   $*" >&2; }

# Port metadata: <name>|<env var>|<derived url vars (comma-separated)>
PORT_SPECS=(
  "api|API_HOST_PORT|EXPO_PUBLIC_API_URL"
  "martin|MARTIN_HOST_PORT|EXPO_PUBLIC_MARTIN_URL,MARTIN_URL"
  "postgres|POSTGRES_HOST_PORT|"
  "metro|METRO_HOST_PORT|"
)

port_name_to_var() {
  local name="$1"
  for spec in "${PORT_SPECS[@]}"; do
    local n="${spec%%|*}"
    if [[ "$n" == "$name" ]]; then
      echo "${spec%%|*}" >/dev/null
      echo "$spec" | cut -d'|' -f2
      return 0
    fi
  done
  return 1
}

# Read a value from .env (falls back to .env.example).
read_value() {
  local key="$1"
  local file="$ENV_FILE"
  [[ -f "$file" ]] || file="$EXAMPLE_FILE"
  [[ -f "$file" ]] || { echo ""; return; }
  awk -F= -v k="$key" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      gsub(/^[[:space:]]*export[[:space:]]+/, "")
      gsub(/[[:space:]]*#.*$/, "")
    }
    $1 == k { sub(/^[^=]+=/, ""); print; exit }
  ' "$file"
}

# Ensure .env exists, seeded from .env.example if needed.
ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ ! -f "$EXAMPLE_FILE" ]]; then
      err ".env and .env.example are both missing; nothing to do."
      exit 1
    fi
    log "Creating .env from .env.example..."
    cp "$EXAMPLE_FILE" "$ENV_FILE"
  fi
}

# Write a key=value to .env, replacing an existing line (with or without
# leading `export`) or appending if absent. Preserves all other content.
set_value() {
  local key="$1"
  local value="$2"
  ensure_env
  if grep -qE "^[[:space:]]*(export[[:space:]]+)?${key}=" "$ENV_FILE"; then
    # Use a python one-liner for an in-place, comment-safe replacement.
    python3 - "$ENV_FILE" "$key" "$value" <<'PY'
import sys, re
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()
pat = re.compile(rf"^(\s*)(export\s+)?{re.escape(key)}\s*=")
out = []
replaced = False
for line in lines:
    stripped = line.lstrip()
    if not replaced and pat.match(line):
        prefix = pat.match(line).group(1)
        out.append(f"{prefix}{key}={value}\n")
        replaced = True
    else:
        out.append(line)
if not replaced:
    if out and not out[-1].endswith("\n"):
        out[-1] += "\n"
    out.append(f"{key}={value}\n")
with open(path, "w", encoding="utf-8") as f:
    f.writelines(out)
PY
  else
    printf "\n%s=%s\n" "$key" "$value" >> "$ENV_FILE"
  fi
}

is_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 1 <= 1$1 && 1$1 <= 65535 ))
}

cmd_show() {
  ensure_env

  echo -e "${CYAN}Compose project:${NC} $(read_value COMPOSE_PROJECT_NAME)"
  echo -e "${CYAN}Host ports:${NC}"
  for spec in "${PORT_SPECS[@]}"; do
    local name="${spec%%|*}"
    local var=$(echo "$spec" | cut -d'|' -f2)
    printf "  %-9s %s=%s\n" "$name" "$var" "$(read_value "$var")"
  done
  echo -e "${CYAN}Derived URLs:${NC}"
  printf "  %-26s %s\n" "EXPO_PUBLIC_API_URL"    "$(read_value EXPO_PUBLIC_API_URL)"
  printf "  %-26s %s\n" "EXPO_PUBLIC_MARTIN_URL" "$(read_value EXPO_PUBLIC_MARTIN_URL)"
  printf "  %-26s %s\n" "MARTIN_URL"             "$(read_value MARTIN_URL)"
  echo -e "${CYAN}CORS_ORIGINS:${NC} $(read_value CORS_ORIGINS)"
}

cmd_set() {
  local name="${1:-}"
  local value="${2:-}"
  if [[ -z "$name" || -z "$value" ]]; then
    err "Usage: $0 set <name> <port>"
    err "  names: api, martin, postgres, metro"
    exit 1
  fi
  local var
  if ! var=$(port_name_to_var "$name"); then
    err "Unknown port name: $name (expected: api, martin, postgres, metro)"
    exit 1
  fi
  if ! is_port "$value"; then
    err "Invalid port: $value (must be 1-65535)"
    exit 1
  fi
  set_value "$var" "$value"
  rewrite_derived "$name" "$value"
  log "$name port set to $value"
  cmd_show
}

cmd_shift() {
  local n="${1:-}"
  if [[ -z "$n" ]] || ! [[ "$n" =~ ^-?[0-9]+$ ]]; then
    err "Usage: $0 shift <integer>  (e.g. '$0 shift 10' to add 10 to every port)"
    exit 1
  fi
  for spec in "${PORT_SPECS[@]}"; do
    local name="${spec%%|*}"
    local var=$(echo "$spec" | cut -d'|' -f2)
    local current=$(read_value "$var")
    current="${current:-0}"
    local next=$(( current + n ))
    if ! is_port "$next"; then
      err "Shift would set $name to $next, which is not a valid port"
      exit 1
    fi
    set_value "$var" "$next"
    rewrite_derived "$name" "$next"
  done
  log "Shifted all host ports by $n"
  cmd_show
}

cmd_project() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    err "Usage: $0 project <name>"
    exit 1
  fi
  if ! [[ "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    err "Invalid project name: $name (use letters, digits, '_' or '-')"
    exit 1
  fi
  set_value COMPOSE_PROJECT_NAME "$name"
  log "COMPOSE_PROJECT_NAME set to $name"
  log "Bring the new project up with: docker compose -f docker/docker-compose.yml -p $name up -d"
}

cmd_reset() {
  if [[ ! -f "$EXAMPLE_FILE" ]]; then
    err ".env.example missing; cannot reset."
    exit 1
  fi
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  log ".env restored from .env.example"
  cmd_show
}

# When a host port changes, rewrite the derived URLs that reference it.
rewrite_derived() {
  local name="$1"
  local value="$2"
  case "$name" in
    api)
      set_value EXPO_PUBLIC_API_URL "http://localhost:${value}"
      ensure_cors_origin "http://localhost:${value}"
      ;;
    martin)
      set_value EXPO_PUBLIC_MARTIN_URL "http://localhost:${value}"
      set_value MARTIN_URL            "http://localhost:${value}"
      ;;
    postgres|metro)
      : # no derived URLs
      ;;
  esac
}

# Make sure CORS_ORIGINS contains a given origin; add it if missing.
ensure_cors_origin() {
  local origin="$1"
  local current
  current=$(read_value CORS_ORIGINS)
  if [[ ",$current," == *",$origin,"* ]]; then
    return
  fi
  if [[ -z "$current" ]]; then
    set_value CORS_ORIGINS "$origin"
  else
    set_value CORS_ORIGINS "${current},${origin}"
  fi
}

cmd_help() {
  cat <<'EOF'
Manage Magnum ports for running multiple instances in parallel.

.env is the single source of truth. This script reads it, lets you
change host-side ports and the docker compose project name, and
rewrites the derived URLs (EXPO_PUBLIC_*, MARTIN_URL, CORS_ORIGINS)
to match.

Usage:
  ./scripts/ports.sh                       show current settings
  ./scripts/ports.sh show                  same
  ./scripts/ports.sh set <name> <port>     set a single port
  ./scripts/ports.sh shift <n>             add N to every host port
  ./scripts/ports.sh project <name>        set COMPOSE_PROJECT_NAME
  ./scripts/ports.sh reset                 restore .env.example defaults
  ./scripts/ports.sh help                  show this help

Recognised port names: api, martin, postgres, metro
EOF
}

case "${1:-show}" in
  show)   cmd_show ;;
  set)    shift; cmd_set "$@" ;;
  shift)  shift; cmd_shift "$@" ;;
  project) shift; cmd_project "$@" ;;
  reset)  cmd_reset ;;
  help|-h|--help) cmd_help ;;
  *) err "Unknown command: $1"; cmd_help; exit 1 ;;
esac
