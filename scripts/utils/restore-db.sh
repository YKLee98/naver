// scripts/utils/restore-db.sh
#!/bin/bash
# Database restoration script

set -e

BACKUP_DIR="/backups/mongodb"
TIMESTAMP=${1:-}
MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/hallyu-pomaholic"}

if [ -z "$TIMESTAMP" ]; then
    echo "Usage: $0 <timestamp>"
    echo "Available backups:"
    ls -la $BACKUP_DIR/backup_*.gz | awk '{print $9}'
    exit 1
fi

BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.gz"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "⚠️  WARNING: This will restore the database from backup"
echo "Backup file: $BACKUP_FILE"
echo "Target database: $MONGODB_URI"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restoration cancelled"
    exit 0
fi

echo "Starting database restoration..."

# Create a temporary backup of current data
TEMP_BACKUP="${BACKUP_DIR}/temp_backup_$(date +%Y%m%d_%H%M%S).gz"
echo "Creating temporary backup of current data..."
mongodump --uri="$MONGODB_URI" --archive="$TEMP_BACKUP" --gzip

# Restore from backup
echo "Restoring from backup..."
mongorestore --uri="$MONGODB_URI" --archive="$BACKUP_FILE" --gzip --drop

echo "✅ Database restoration completed"
echo "Temporary backup saved at: $TEMP_BACKUP"

