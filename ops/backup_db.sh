#!/bin/sh
# Nightly backup per plan §11. Runs pg_dump inside the running `db` compose service (no local
# postgresql-client install required) and writes a timestamped custom-format dump to ./backups/
# on the host, via `docker cp` — custom format (-Fc) so pg_restore can do selective/parallel
# restores later, not just a single monolithic SQL replay.
set -eu

# Prevent Git Bash/MSYS from rewriting container-side /tmp/... paths into Windows paths when
# they're passed through to `docker compose exec` — those paths are meant for the Linux
# container's filesystem, not the host's.
export MSYS_NO_PATHCONV=1

COMPOSE_SERVICE="${COMPOSE_SERVICE:-db}"
DB_NAME="${POSTGRES_DB:-casewright}"
DB_USER="${POSTGRES_USER:-casewright}"
BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_NAME="casewright_${TIMESTAMP}.dump"
CONTAINER_PATH="/tmp/${DUMP_NAME}"

mkdir -p "$BACKUP_DIR"

echo "Dumping ${DB_NAME} from the '${COMPOSE_SERVICE}' service..."
docker compose exec -T "$COMPOSE_SERVICE" sh -c "pg_dump -U '$DB_USER' -Fc '$DB_NAME' > '$CONTAINER_PATH'"
docker compose cp "${COMPOSE_SERVICE}:${CONTAINER_PATH}" "${BACKUP_DIR}/${DUMP_NAME}"
docker compose exec -T "$COMPOSE_SERVICE" rm -f "$CONTAINER_PATH"

echo "Backup written to ${BACKUP_DIR}/${DUMP_NAME}"
ls -la "${BACKUP_DIR}/${DUMP_NAME}"
