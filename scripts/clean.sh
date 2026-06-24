#!/usr/bin/env bash
# Stop and remove Docker resources belonging to THIS Magnum instance only
# (matched by COMPOSE_PROJECT_NAME from .env). Other instances on the host
# are left alone.
#
# Usage:
#   ./scripts/clean.sh                    stop + remove containers + networks
#   ./scripts/clean.sh --volumes          also remove the postgres data volume
#   ./scripts/clean.sh --images           also remove the built api image
#   ./scripts/clean.sh --build            also prune this project's build cache
#   ./scripts/clean.sh --all              all of the above
#   ./scripts/clean.sh --force            skip confirmation prompt
#   ./scripts/clean.sh --dry-run          show what would be removed, do nothing
#   ./scripts/clean.sh help

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
log()  { echo -e "${GREEN}[clean]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[err]${NC}   $*" >&2; }

# ── Load .env to get COMPOSE_PROJECT_NAME ──────────────────────────
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
elif [ -f .env.example ]; then
  warn ".env not found; falling back to .env.example"
  set -a
  # shellcheck disable=SC1091
  source .env.example
  set +a
fi

PROJECT="${COMPOSE_PROJECT_NAME:-magnum}"
COMPOSE_FILE="docker/docker-compose.yml"

# ── Parse args ─────────────────────────────────────────────────────
DO_VOLUMES=false
DO_IMAGES=false
DO_BUILD=false
FORCE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --volumes|-v) DO_VOLUMES=true ;;
    --images|-i)  DO_IMAGES=true ;;
    --build|-b)   DO_BUILD=true ;;
    --all|-a)     DO_VOLUMES=true; DO_IMAGES=true; DO_BUILD=true ;;
    --force|-f)   FORCE=true ;;
    --dry-run|-n) DRY_RUN=true ;;
    help|-h|--help)
      cat <<'EOF'
Stop and remove Docker resources belonging to THIS Magnum instance only
(matched by COMPOSE_PROJECT_NAME from .env). Other instances on the host
are left alone.

Usage:
  ./scripts/clean.sh                    stop + remove containers + networks
  ./scripts/clean.sh --volumes          also remove the postgres data volume
  ./scripts/clean.sh --images           also remove the built api image
  ./scripts/clean.sh --build            also prune this project's build cache
  ./scripts/clean.sh --all              all of the above
  ./scripts/clean.sh --force            skip confirmation prompt
  ./scripts/clean.sh --dry-run          show what would be removed, do nothing
  ./scripts/clean.sh help
EOF
      exit 0
      ;;
    *) err "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

if ! command -v docker >/dev/null 2>&1; then
  err "docker is not installed or not in PATH"
  exit 1
fi

# ── Discover resources belonging to this project ───────────────────
# Containers/networks have label com.docker.compose.project=$PROJECT.
# Volumes (when named) don't carry the label, but the named volumes in
# this compose file are prefixed with $PROJECT (see docker-compose.yml).
# Images for the api service are tagged $PROJECT-api.

mapfile -t CONTAINERS < <(
  docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
    --format '{{.Names}}' 2>/dev/null | sort
)

mapfile -t NETWORKS < <(
  docker network ls --filter "label=com.docker.compose.project=$PROJECT" \
    --format '{{.Name}}' 2>/dev/null | sort
)

mapfile -t VOLUMES < <(
  docker volume ls --format '{{.Name}}' 2>/dev/null \
    | grep -E "^${PROJECT}(-pgdata|-.*_pgdata)?\$" | sort
)

mapfile -t IMAGES < <(
  # Only the locally-built api image (not upstream postgres/martin pulls).
  docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
    | grep -E "^${PROJECT}-api(:.*)?\$" | sort
)

# ── Print what will be touched ─────────────────────────────────────
echo -e "${CYAN}Project:${NC}  $PROJECT"
echo -e "${CYAN}Compose:${NC}  $COMPOSE_FILE"
echo ""

if [[ ${#CONTAINERS[@]} -gt 0 ]]; then
  echo -e "${CYAN}Containers:${NC}  (${#CONTAINERS[@]})"
  printf "  - %s\n" "${CONTAINERS[@]}"
else
  echo -e "${CYAN}Containers:${NC}  (none)"
fi

if [[ ${#NETWORKS[@]} -gt 0 ]]; then
  echo -e "${CYAN}Networks:${NC}    (${#NETWORKS[@]})"
  printf "  - %s\n" "${NETWORKS[@]}"
else
  echo -e "${CYAN}Networks:${NC}    (none)"
fi

if $DO_VOLUMES; then
  if [[ ${#VOLUMES[@]} -gt 0 ]]; then
    echo -e "${CYAN}Volumes:${NC}     ${YELLOW}(will be removed)${NC}  (${#VOLUMES[@]})"
    printf "  - %s\n" "${VOLUMES[@]}"
  else
    echo -e "${CYAN}Volumes:${NC}     (none)"
  fi
else
  if [[ ${#VOLUMES[@]} -gt 0 ]]; then
    echo -e "${CYAN}Volumes:${NC}     ${GREEN}(kept)${NC}  (${#VOLUMES[@]})"
    printf "  - %s\n" "${VOLUMES[@]}"
    echo -e "         pass --volumes to also delete"
  else
    echo -e "${CYAN}Volumes:${NC}     (none)"
  fi
fi

if $DO_IMAGES; then
  if [[ ${#IMAGES[@]} -gt 0 ]]; then
    echo -e "${CYAN}Images:${NC}      ${YELLOW}(will be removed)${NC}  (${#IMAGES[@]})"
    printf "  - %s\n" "${IMAGES[@]}"
  else
    echo -e "${CYAN}Images:${NC}      (none)"
  fi
else
  if [[ ${#IMAGES[@]} -gt 0 ]]; then
    echo -e "${CYAN}Images:${NC}      ${GREEN}(kept)${NC}  (${#IMAGES[@]})"
    printf "  - %s\n" "${IMAGES[@]}"
    echo -e "         pass --images to also delete"
  else
    echo -e "${CYAN}Images:${NC}      (none)"
  fi
fi

if $DO_BUILD; then
  echo -e "${CYAN}Build cache:${NC} ${YELLOW}(will be pruned for this project)${NC}"
else
  echo -e "${CYAN}Build cache:${NC} ${GREEN}(kept)${NC}    pass --build to also prune"
fi

# ── If nothing to do, exit early ───────────────────────────────────
if [[ ${#CONTAINERS[@]} -eq 0 && ${#NETWORKS[@]} -eq 0 \
   && ( $DO_VOLUMES == false || ${#VOLUMES[@]} -eq 0 ) \
   && ( $DO_IMAGES  == false || ${#IMAGES[@]}  -eq 0 ) \
   && $DO_BUILD == false ]]; then
  log "Nothing to do for project '$PROJECT'."
  exit 0
fi

# ── Confirm ────────────────────────────────────────────────────────
if $DRY_RUN; then
  log "Dry run; nothing was removed."
  exit 0
fi

if ! $FORCE; then
  echo ""
  warn "This will stop and remove the resources marked above."
  read -r -p "Proceed? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    log "Aborted."
    exit 0
  fi
fi

# ── Remove ─────────────────────────────────────────────────────────
# Use docker compose down for containers + networks (handles dependencies).
# Pass --volumes for named volumes too. We deliberately do NOT pass
# --rmi (which would also nuke upstream images like postgis/martin);
# instead --images only removes the locally-built api image below.
DOWN_ARGS=( -p "$PROJECT" -f "$COMPOSE_FILE" down --remove-orphans )
$DO_VOLUMES && DOWN_ARGS+=( --volumes )

log "docker compose ${DOWN_ARGS[*]}"
docker compose "${DOWN_ARGS[@]}"

# Belt-and-suspenders: any stragglers with this project label that
# compose missed (e.g. crashed containers stuck in Created).
LEFT=$(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" -q || true)
if [[ -n "$LEFT" ]]; then
  warn "Force-removing leftover containers: $LEFT"
  docker rm -f $LEFT >/dev/null
fi

# Remove only the locally-built api image (never upstream images).
if $DO_IMAGES; then
  for img in "${IMAGES[@]}"; do
    log "Removing image: $img"
    docker rmi "$img" >/dev/null 2>&1 || warn "Could not remove $img"
  done
fi

# Build cache for this project's images.
if $DO_BUILD; then
  for img in "${IMAGES[@]}"; do
    log "Pruning build cache for $img"
    docker builder prune --filter "label=com.docker.compose.project=$PROJECT" -f >/dev/null 2>&1 || true
  done
  # Generic prune limited to dangling layers of this project; safe to ignore failure.
  docker image prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1 || true
fi

log "Done."
