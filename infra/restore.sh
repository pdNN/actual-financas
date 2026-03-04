#!/bin/bash
set -euo pipefail

# === Actual Financas — Restore from GCS Backup ===
# Usage: ./restore.sh [backup-name]
# Example: ./restore.sh backup-20250303_030000

BUCKET="gs://actual-financas-backups"
DATA_DIR="/opt/actual/data"
RESTORE_DIR="/tmp/actual-restore"

if [ -z "${1:-}" ]; then
  echo "Available backups:"
  gsutil ls "$BUCKET/" | sort -r | head -20
  echo ""
  echo "Usage: $0 <backup-name>"
  echo "Example: $0 backup-20250303_030000"
  exit 1
fi

BACKUP_NAME="$1"
echo "=== Restoring from ${BUCKET}/${BACKUP_NAME}/ ==="

# Stop the app
echo "Stopping Actual Budget..."
cd /opt/actual && docker compose -f docker-compose.prod.yml stop actual || true

# Download backup
rm -rf "$RESTORE_DIR"
mkdir -p "$RESTORE_DIR"
gsutil -m cp -r "${BUCKET}/${BACKUP_NAME}/*" "$RESTORE_DIR/"

# Restore account database
if [ -f "$RESTORE_DIR/account.sqlite" ]; then
  cp "$RESTORE_DIR/account.sqlite" "$DATA_DIR/server-files/account.sqlite"
  echo "Restored account.sqlite"
fi

# Restore user files
if [ -d "$RESTORE_DIR/user-files" ]; then
  cp -r "$RESTORE_DIR/user-files/"* "$DATA_DIR/user-files/" 2>/dev/null || true
  echo "Restored user-files"
fi

# Restore server-files metadata
if [ -d "$RESTORE_DIR/server-files" ]; then
  cp -r "$RESTORE_DIR/server-files/"* "$DATA_DIR/server-files/" 2>/dev/null || true
  echo "Restored server-files metadata"
fi

# Fix ownership
chown -R 1001:1001 "$DATA_DIR"

# Restart the app
echo "Starting Actual Budget..."
cd /opt/actual && docker compose -f docker-compose.prod.yml up -d actual

# Cleanup
rm -rf "$RESTORE_DIR"

echo "=== Restore completed at $(date) ==="
