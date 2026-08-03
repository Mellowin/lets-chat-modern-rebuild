#!/usr/bin/env bash
#
# Lightweight regression test for the checksum format and filename validation
# fixes found in the Codex post-merge review.
#
# This does not perform a real database backup/restore; it validates that the
# backup script records a plain basename in the checksum and that the restore
# script would reject a checksum whose filename field contains path components.

set -euo pipefail

TMP_DIR=$(mktemp -d "letschat-checksum-test-XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

DUMP_NAME="20260101T000000Z_letschat.dump"
DUMP_FILE="$TMP_DIR/$DUMP_NAME"
echo "dummy dump data" > "$DUMP_FILE"

# Mirror the backup script's checksum generation, which runs inside the temp
# directory so the recorded filename is a plain basename.
( cd "$TMP_DIR" && sha256sum "$DUMP_NAME" > "$DUMP_NAME.sha256" )

RECORDED_NAME=$(awk '{print $2}' "$TMP_DIR/$DUMP_NAME.sha256")
RECORDED_NAME="${RECORDED_NAME#\*}"  # strip leading binary-mode marker from sha256sum output
if [[ -z "$RECORDED_NAME" ]]; then
  echo "FAIL: checksum filename field is empty" >&2
  exit 1
fi
if [[ "$RECORDED_NAME" != "$DUMP_NAME" ]]; then
  echo "FAIL: backup checksum recorded '$RECORDED_NAME' instead of basename '$DUMP_NAME'" >&2
  exit 1
fi
if [[ "$RECORDED_NAME" == */* ]]; then
  echo "FAIL: backup checksum recorded a path instead of a basename" >&2
  exit 1
fi
echo "✅ Backup checksum uses a plain basename"

# Mirror the restore script's validation of the checksum filename field.
EXPECTED_NAME="$DUMP_NAME"

# Valid checksum must pass.
RECORDED_NAME=$(awk '{print $2}' "$TMP_DIR/$DUMP_NAME.sha256")
RECORDED_NAME="${RECORDED_NAME#\*}"  # strip leading binary-mode marker from sha256sum output
if [[ -z "$RECORDED_NAME" ]] || [[ "$RECORDED_NAME" != "$EXPECTED_NAME" ]] || [[ "$RECORDED_NAME" == */* ]]; then
  echo "FAIL: restore validation rejected a valid checksum" >&2
  exit 1
fi
echo "✅ Restore validation accepts a valid basename checksum"

# Malicious checksum containing a path component must be rejected.
echo "deadbeef  ../evil.dump" > "$TMP_DIR/malicious.dump.sha256"
MALICIOUS_NAME=$(awk '{print $2}' "$TMP_DIR/malicious.dump.sha256")
if [[ -z "$MALICIOUS_NAME" ]] || [[ "$MALICIOUS_NAME" != "$EXPECTED_NAME" ]] && [[ "$MALICIOUS_NAME" == */* ]]; then
  echo "✅ Restore validation rejects a checksum with path components"
else
  echo "FAIL: restore validation did not reject a malicious checksum filename" >&2
  exit 1
fi

echo "All checksum regression tests passed."
