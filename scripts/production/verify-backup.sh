#!/usr/bin/env bash
#
# Download a backup from object storage, verify its SHA-256 checksum, and list
# its contents with pg_restore. This performs a non-destructive verification.
#
# Usage:
#   ./scripts/production/verify-backup.sh s3://bucket/backups/postgres/TIMESTAMP_db.dump

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  . "$ENV_FILE"
  set +a
fi

S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"
if [[ "$S3_FORCE_PATH_STYLE" == "true" ]]; then
  export AWS_S3_ADDRESSING_STYLE=path
fi
export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:?S3_ACCESS_KEY required}"
export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:?S3_SECRET_KEY required}"
export AWS_DEFAULT_REGION="${S3_REGION:?S3_REGION required}"

SOURCE_URI="${1:-}"
if [[ -z "$SOURCE_URI" ]] || [[ ! "$SOURCE_URI" =~ ^s3:// ]]; then
  echo "Usage: $0 s3://bucket/backups/postgres/TIMESTAMP_db.dump" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d "letschat-verify-backup-XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

DUMP_FILE="$TMP_DIR/backup.dump"
CHECKSUM_FILE="$TMP_DIR/backup.dump.sha256"

echo "Downloading backup..."
aws s3 cp "$SOURCE_URI" "$DUMP_FILE" --endpoint-url "${S3_ENDPOINT:?S3_ENDPOINT required}" --no-progress
aws s3 cp "${SOURCE_URI}.sha256" "$CHECKSUM_FILE" --endpoint-url "$S3_ENDPOINT" --no-progress || true

if [[ -f "$CHECKSUM_FILE" ]]; then
  pushd "$TMP_DIR" >/dev/null
  if ! sha256sum -c "$(basename "$CHECKSUM_FILE")" >/dev/null; then
    echo "Checksum verification FAILED." >&2
    exit 1
  fi
  popd >/dev/null
  echo "Checksum OK."
else
  echo "Warning: checksum file not found. Computing local checksum only."
  sha256sum "$DUMP_FILE"
fi

echo "Backup archive info:"
pg_restore --list "$DUMP_FILE" | wc -l
echo "Top-level restore objects:"
pg_restore -l "$DUMP_FILE" | head -30

echo "Backup verification completed successfully."
