#!/usr/bin/env bash
#
# Restore a PostgreSQL backup created by backup-postgres.sh to a target database.
#
# By default this script only supports restoring to a database whose name
# contains "verify" or "verification" unless the operator explicitly passes the
# --acknowledge-destructive flag. This prevents accidental restores into the
# production database.
#
# Requirements:
#   - pg_restore (PostgreSQL client tools)
#   - AWS CLI v2 configured only via environment variables
#
# Usage:
#   RESTORE_TARGET_DATABASE_URL='postgresql://user:pass@host:5432/verification_db' \
#     ./scripts/production/restore-postgres.sh s3://bucket/backups/postgres/20260101T000000Z_letschat.dump
#
#   To restore into the original database (DESTRUCTIVE):
#     ./scripts/production/restore-postgres.sh <s3-uri> --acknowledge-destructive

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  . "$ENV_FILE"
  set +a
fi

missing_vars=()
for var in S3_ENDPOINT S3_REGION S3_ACCESS_KEY S3_SECRET_KEY; do
  if [[ -z "${!var:-}" ]]; then
    missing_vars+=("$var")
  fi
done
if [[ ${#missing_vars[@]} -gt 0 ]]; then
  echo "Missing required environment variables: ${missing_vars[*]}" >&2
  exit 1
fi

S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"
if [[ "$S3_FORCE_PATH_STYLE" == "true" ]]; then
  export AWS_S3_ADDRESSING_STYLE=path
fi
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="$S3_REGION"

ACKNOWLEDGE_DESTRUCTIVE=false
SOURCE_URI=""

for arg in "$@"; do
  case "$arg" in
    --acknowledge-destructive)
      ACKNOWLEDGE_DESTRUCTIVE=true
      ;;
    s3://*)
      SOURCE_URI="$arg"
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SOURCE_URI" ]]; then
  echo "Usage: $0 s3://bucket/backups/postgres/TIMESTAMP_db.dump [--acknowledge-destructive]" >&2
  exit 1
fi

if [[ -z "${RESTORE_TARGET_DATABASE_URL:-}" ]]; then
  echo "RESTORE_TARGET_DATABASE_URL is required." >&2
  exit 1
fi

# Parse target database URL.
TARGET_PARTS=$(node -e '
const url = new URL(process.env.RESTORE_TARGET_DATABASE_URL);
console.log([
  decodeURIComponent(url.username),
  decodeURIComponent(url.password),
  url.hostname,
  url.port || "5432",
  url.pathname.replace(/^\//, "").split("?")[0],
].join("\t"));
')
IFS=$'\t' read -r TARGET_USER TARGET_PASSWORD TARGET_HOST TARGET_PORT TARGET_NAME <<< "$TARGET_PARTS"

if [[ ! "$TARGET_NAME" =~ (verify|verification) ]] && [[ "$ACKNOWLEDGE_DESTRUCTIVE" != "true" ]]; then
  echo "Refusing to restore into '${TARGET_NAME}' because its name does not contain 'verify' or 'verification'." >&2
  echo "Pass --acknowledge-destructive only if you accept full data loss on the target database." >&2
  exit 1
fi

echo "Target database: ${TARGET_NAME}@${TARGET_HOST}:${TARGET_PORT}"
read -r -p "This will drop and recreate the target database. Type the database name to confirm: " confirm
if [[ "$confirm" != "$TARGET_NAME" ]]; then
  echo "Confirmation mismatch. Aborting." >&2
  exit 1
fi

TMP_DIR=$(mktemp -d "letschat-restore-XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

DUMP_FILE="$TMP_DIR/backup.dump"
CHECKSUM_FILE="$TMP_DIR/backup.dump.sha256"

aws s3 cp "$SOURCE_URI" "$DUMP_FILE" --endpoint-url "$S3_ENDPOINT" --no-progress
aws s3 cp "${SOURCE_URI}.sha256" "$CHECKSUM_FILE" --endpoint-url "$S3_ENDPOINT" --no-progress || true

if [[ -f "$CHECKSUM_FILE" ]]; then
  pushd "$TMP_DIR" >/dev/null
  if ! sha256sum -c "$(basename "$CHECKSUM_FILE")" >/dev/null; then
    echo "Checksum verification failed. Aborting." >&2
    exit 1
  fi
  popd >/dev/null
  echo "Checksum OK."
fi

echo "Backup contents (pg_restore -l):"
pg_restore -l "$DUMP_FILE" | head -50

export PGUSER="$TARGET_USER"
export PGPASSWORD="$TARGET_PASSWORD"
export PGHOST="$TARGET_HOST"
export PGPORT="$TARGET_PORT"

echo "Dropping and recreating target database: $TARGET_NAME"
dropdb --if-exists "$TARGET_NAME"
createdb "$TARGET_NAME"

echo "Restoring backup into $TARGET_NAME..."
pg_restore -d "$TARGET_NAME" -j 2 --no-owner --no-privileges "$DUMP_FILE" || {
  echo "pg_restore finished with warnings or errors. Review output above." >&2
}

echo "Restore into ${TARGET_NAME} completed."
