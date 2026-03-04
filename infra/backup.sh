#!/bin/bash
set -euo pipefail

# === Actual Financas — SQLite Backup to GCS ===
# Run via cron: 0 3 * * * /opt/actual/backup.sh >> /var/log/actual-backup.log 2>&1

BUCKET="gs://actual-financas-backups"
DATA_DIR="/opt/actual/data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/actual-backup-${TIMESTAMP}"

echo "=== Backup started at $(date) ==="

mkdir -p "$BACKUP_DIR"

# Safely backup SQLite databases using .backup command (won't corrupt while DB is in use)
if [ -f "$DATA_DIR/server-files/account.sqlite" ]; then
  sqlite3 "$DATA_DIR/server-files/account.sqlite" ".backup '${BACKUP_DIR}/account.sqlite'"
  echo "Backed up account.sqlite"
fi

# Backup user budget files
if [ -d "$DATA_DIR/user-files" ]; then
  mkdir -p "$BACKUP_DIR/user-files"
  for db in "$DATA_DIR/user-files"/*.sqlite; do
    [ -f "$db" ] || continue
    BASENAME=$(basename "$db")
    sqlite3 "$db" ".backup '${BACKUP_DIR}/user-files/${BASENAME}'"
    echo "Backed up user-files/${BASENAME}"
  done
fi

# Backup server-files metadata (non-sqlite files)
if [ -d "$DATA_DIR/server-files" ]; then
  mkdir -p "$BACKUP_DIR/server-files"
  find "$DATA_DIR/server-files" -not -name "*.sqlite" -type f -exec cp {} "$BACKUP_DIR/server-files/" \;
fi

# Upload to GCS
gsutil -m cp -r "$BACKUP_DIR" "${BUCKET}/backup-${TIMESTAMP}/"
echo "Uploaded to ${BUCKET}/backup-${TIMESTAMP}/"

# Cleanup local temp
rm -rf "$BACKUP_DIR"

echo "=== Backup completed at $(date) ==="
