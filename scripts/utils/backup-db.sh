#!/bin/bash
# scripts/utils/backup-db.sh

set -e

BACKUP_DIR="/backups/mongodb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.gz"
MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/hallyu-pomaholic"}

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

# Perform backup
echo "Starting MongoDB backup..."
mongodump --uri="${MONGODB_URI}" --archive="${BACKUP_FILE}" --gzip

# Upload to S3 (optional)
if [ -n "${BACKUP_S3_BUCKET}" ]; then
    echo "Uploading backup to S3..."
    aws s3 cp "${BACKUP_FILE}" "s3://${BACKUP_S3_BUCKET}/mongodb/${TIMESTAMP}/"
fi

# Clean up old backups (keep last 7 days)
find ${BACKUP_DIR} -name "backup_*.gz" -mtime +7 -delete

echo "Backup completed: ${BACKUP_FILE}"
