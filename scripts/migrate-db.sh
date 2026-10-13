#!/usr/bin/env bash
set -euo pipefail
: "${SOURCE_DB_HOST:?Set SOURCE_DB_HOST}"
: "${SOURCE_DB_NAME:?Set SOURCE_DB_NAME}"
: "${SOURCE_DB_USER:?Set SOURCE_DB_USER}"
: "${SOURCE_DB_PASSWORD:?Set SOURCE_DB_PASSWORD}"
: "${TARGET_DB_HOST:?Set TARGET_DB_HOST}"
: "${TARGET_DB_NAME:?Set TARGET_DB_NAME}"
: "${TARGET_DB_USER:?Set TARGET_DB_USER}"
: "${TARGET_DB_PASSWORD:?Set TARGET_DB_PASSWORD}"
echo "Streaming source dump to target; target objects are not dropped."
PGPASSWORD="$SOURCE_DB_PASSWORD" pg_dump --host="$SOURCE_DB_HOST" --username="$SOURCE_DB_USER" --dbname="$SOURCE_DB_NAME" --no-owner --no-privileges \
| PGPASSWORD="$TARGET_DB_PASSWORD" psql --host="$TARGET_DB_HOST" --username="$TARGET_DB_USER" --dbname="$TARGET_DB_NAME" --set=ON_ERROR_STOP=1
echo "Done. Verify row counts, indexes, extensions, permissions and dependent objects."
