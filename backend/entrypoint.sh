#!/bin/sh
set -e

alembic upgrade head
python -m scripts.setup_checkpointer
exec "$@"
