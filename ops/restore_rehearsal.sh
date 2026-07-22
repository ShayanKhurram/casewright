#!/bin/sh
# Quarterly restore rehearsal per plan §11: prove a backup actually restores, not just that
# the backup command exits 0. Restores into a scratch database (never overwrites the live one),
# compares row counts per table against the live database, then drops the scratch database.
set -eu

# See ops/backup_db.sh — same MSYS path-mangling issue applies here.
export MSYS_NO_PATHCONV=1

if [ $# -lt 1 ]; then
    echo "Usage: $0 <path-to-dump-file>" >&2
    exit 1
fi

DUMP_FILE="$1"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-db}"
DB_NAME="${POSTGRES_DB:-casewright}"
DB_USER="${POSTGRES_USER:-casewright}"
SCRATCH_DB="casewright_restore_rehearsal"
CONTAINER_DUMP_PATH="/tmp/rehearsal_$(basename "$DUMP_FILE")"

if [ ! -f "$DUMP_FILE" ]; then
    echo "Dump file not found: $DUMP_FILE" >&2
    exit 1
fi

echo "Copying dump into the '${COMPOSE_SERVICE}' service..."
docker compose cp "$DUMP_FILE" "${COMPOSE_SERVICE}:${CONTAINER_DUMP_PATH}"

echo "Dropping any stale scratch database and recreating it..."
docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${SCRATCH_DB}"
docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE ${SCRATCH_DB}"
docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d "$SCRATCH_DB" -c "CREATE EXTENSION IF NOT EXISTS vector"

echo "Restoring into ${SCRATCH_DB}..."
docker compose exec -T "$COMPOSE_SERVICE" pg_restore -U "$DB_USER" -d "$SCRATCH_DB" --no-owner "$CONTAINER_DUMP_PATH"

echo ""
echo "Comparing row counts: live '${DB_NAME}' vs. restored '${SCRATCH_DB}'"
echo "-----------------------------------------------------------------"

TABLES=$(docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")

FAILED=0
for TABLE in $TABLES; do
    LIVE_COUNT=$(docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM ${TABLE}")
    RESTORED_COUNT=$(docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d "$SCRATCH_DB" -tAc "SELECT count(*) FROM ${TABLE}")
    LIVE_COUNT=$(echo "$LIVE_COUNT" | tr -d '[:space:]')
    RESTORED_COUNT=$(echo "$RESTORED_COUNT" | tr -d '[:space:]')
    if [ "$LIVE_COUNT" = "$RESTORED_COUNT" ]; then
        echo "  OK    ${TABLE}: ${LIVE_COUNT}"
    else
        echo "  FAIL  ${TABLE}: live=${LIVE_COUNT} restored=${RESTORED_COUNT}"
        FAILED=1
    fi
done

echo ""
echo "Cleaning up: dropping ${SCRATCH_DB} and the copied dump file..."
docker compose exec -T "$COMPOSE_SERVICE" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${SCRATCH_DB}"
docker compose exec -T "$COMPOSE_SERVICE" rm -f "$CONTAINER_DUMP_PATH"

if [ "$FAILED" -eq 0 ]; then
    echo "RESULT: PASS — restored row counts match the live database for every table."
    exit 0
else
    echo "RESULT: FAIL — see mismatches above."
    exit 1
fi
