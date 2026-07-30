#!/usr/bin/env bash
#
# Create a timestamped pg_dump custom-format backup of the Lets Chat PostgreSQL
# database, compute a SHA-256 checksum, and upload both to private object
# storage (Cloudflare R2 / S3).
#
# Requirements:
#   - pg_dump (PostgreSQL client tools)
#   - AWS CLI v2 configured only via environment variables (do not commit credentials)
#   - DATABASE_URL, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY,
#     S3_BUCKET, and optionally BACKUP_BUCKET/BACKUP_PREFIX/RETENTION_COUNT
#
# Usage:
#   ENV_FILE=.env.production ./scripts/production/backup-postgres.sh
#
# The script performs a dry run by default? No — it always uploads. Old backups
# beyond RETENTION_COUNT are removed only after a successful upload.

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  . "$ENV_FILE"
  set +a
fi

missing_vars=()
for var in DATABASE_URL S3_ENDPOINT S3_REGION S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET; do
  if [[ -z "${!var:-}" ]]; then
    missing_vars+=("$var")
  fi
done
if [[ ${#missing_vars[@]} -gt 0 ]]; then
  echo "Missing required environment variables: ${missing_vars[*]}" >&2
  exit 1
fi

BACKUP_BUCKET="${BACKUP_BUCKET:-$S3_BUCKET}"
BACKUP_PREFIX="${BACKUP_PREFIX:-backups/postgres}"
RETENTION_COUNT="${RETENTION_COUNT:-7}"
S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"

if [[ "$S3_FORCE_PATH_STYLE" == "true" ]]; then
  export AWS_S3_ADDRESSING_STYLE=path
fi
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="$S3_REGION"

# Parse DATABASE_URL using Node so we do not need to handle URL encoding manually.
DB_PARTS=$(node -e '
const url = new URL(process.env.DATABASE_URL);
console.log([
  decodeURIComponent(url.username),
  decodeURIComponent(url.password),
  url.hostname,
  url.port || "5432",
  url.pathname.replace(/^\//, "").split("?")[0],
].join("\t"));
')
IFS=$'\t' read -r DB_USER DB_PASSWORD DB_HOST DB_PORT DB_NAME <<< "$DB_PARTS"

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_NAME="${TIMESTAMP}_${DB_NAME}.dump"
CHECKSUM_NAME="${DUMP_NAME}.sha256"
LOCAL_DUMP=$(mktemp "letschat-backup-XXXXXX.dump")
LOCAL_CHECKSUM="${LOCAL_DUMP}.sha256"

# Remove temporary files on exit, but only if the upload succeeded or we are
# exiting because of an error.
cleanup() {
  rm -f "$LOCAL_DUMP" "$LOCAL_CHECKSUM"
}
trap cleanup EXIT

LOCK_FILE="/tmp/letschat-backup-postgres.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "Another backup is already running. Exiting." >&2
  exit 1
fi

echo "Starting backup of ${DB_NAME}@${DB_HOST}:${DB_PORT}"

export PGPASSWORD="$DB_PASSWORD"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc -f "$LOCAL_DUMP"

sha256sum "$LOCAL_DUMP" | awk '{print $1}' > "$LOCAL_CHECKSUM"
DUMMY_CHECK=$(cat "$LOCAL_CHECKSUM")
echo "Backup size: $(du -h "$LOCAL_DUMP" | cut -f1)  checksum: ${DUMMY_CHECK}"

aws s3 cp "$LOCAL_DUMP" "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/${DUMP_NAME}" \
  --endpoint-url "$S3_ENDPOINT" \
  --no-progress

aws s3 cp "$LOCAL_CHECKSUM" "s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/${CHECKSUM_NAME}" \
  --endpoint-url "$S3_ENDPOINT" \
  --no-progress

echo "Uploaded: s3://${BACKUP_BUCKET}/${BACKUP_PREFIX}/${DUMP_NAME}"

# Retention: keep the most recent RETENTION_COUNT backups, delete older ones.
mapfile -t all_backups < <(aws s3api list-objects-v2 \
  --bucket "$BACKUP_BUCKET" \
  --prefix "${BACKUP_PREFIX}/" \
  --endpoint-url "$S3_ENDPOINT" \
  --query 'Contents[?ends_with(Key, `.dump`)].[Key,LastModified]' \
  --output text 2>/dev/null | sort -k2 || true)

if [[ ${#all_backups[@]} -gt $RETENTION_COUNT ]]; then
  delete_count=0
  for line in "${all_backups[@]:0:$((${#all_backups[@]} - RETENTION_COUNT))}"; do
    key=$(echo "$line" | awk '{print $1}')
    if [[ -n "$key" ]]; then
      echo "Deleting old backup: $key"
      aws s3 rm "s3://${BACKUP_BUCKET}/${key}" --endpoint-url "$S3_ENDPOINT" || true
      delete_count=$((delete_count + 1))
    fi
  done
  echo "Retention cleanup complete. Removed ${delete_count} old backup(s)."
fi

echo "Backup finished successfully."
