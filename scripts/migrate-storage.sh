#!/usr/bin/env bash
set -euo pipefail
: "${YC_ACCESS_KEY:?Set YC_ACCESS_KEY}"
: "${YC_SECRET_KEY:?Set YC_SECRET_KEY}"
: "${CR_ACCESS_KEY:?Set CR_ACCESS_KEY}"
: "${CR_SECRET_KEY:?Set CR_SECRET_KEY}"
: "${CR_ENDPOINT:?Set CR_ENDPOINT, e.g. https://s3.cloud.ru}"
BUCKET="${BUCKET_NAME:-smenavkarmane-business}"
command -v rclone >/dev/null 2>&1 || { echo "rclone is required" >&2; exit 1; }
tmp_config="$(mktemp)"
chmod 600 "$tmp_config"
trap 'rm -f "$tmp_config"' EXIT
export RCLONE_CONFIG="$tmp_config"
rclone config create yc s3 provider Other env_auth false access_key_id "$YC_ACCESS_KEY" secret_access_key "$YC_SECRET_KEY" endpoint "https://storage.yandexcloud.net" >/dev/null
rclone config create cr s3 provider Other env_auth false access_key_id "$CR_ACCESS_KEY" secret_access_key "$CR_SECRET_KEY" endpoint "$CR_ENDPOINT" region "ru-central-1" >/dev/null
echo "Copying source bucket to target: $BUCKET (non-destructive; does not delete target-only objects)"
rclone copy "yc:$BUCKET" "cr:$BUCKET" --progress --transfers 4 --checkers 8
echo "Copy finished. Compare object counts and total size."
