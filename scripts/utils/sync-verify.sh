#!/bin/bash
# scripts/utils/sync-verify.sh

set -e

# MongoDB connection
MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/hallyu-pomaholic"}

log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1"
}

# Verify sync status
verify_sync() {
    log_info "Verifying sync status..."
    
    # Run sync verification
    cd packages/backend
    npm run sync:check -- --verify
    
    # Check for discrepancies
    DISCREPANCIES=$(mongosh "$MONGODB_URI" --eval "
        db.productmappings.aggregate([
            {
                \$lookup: {
                    from: 'inventorytransactions',
                    let: { sku: '\$sku' },
                    pipeline: [
                        { \$match: { \$expr: { \$eq: ['\$sku', '\$\$sku'] } } },
                        { \$sort: { createdAt: -1 } },
                        { \$limit: 1 }
                    ],
                    as: 'lastTransaction'
                }
            },
            {
                \$match: {
                    \$expr: {
                        \$ne: ['\$naverQuantity', '\$shopifyQuantity']
                    }
                }
            }
        ]).toArray().length
    " --quiet)
    
    if [ "$DISCREPANCIES" -gt 0 ]; then
        log_error "Found $DISCREPANCIES inventory discrepancies"
        return 1
    else
        log_info "No inventory discrepancies found"
    fi
    
    # Check sync failures
    FAILURES=$(mongosh "$MONGODB_URI" --eval "
        db.systemlogs.countDocuments({
            level: 'error',
            category: 'sync',
            createdAt: { \$gte: new Date(Date.now() - 24*60*60*1000) }
        })
    " --quiet)
    
    if [ "$FAILURES" -gt 0 ]; then
        log_error "Found $FAILURES sync failures in the last 24 hours"
        return 1
    else
        log_info "No sync failures in the last 24 hours"
    fi
    
    return 0
}

# Generate sync report
generate_report() {
    log_info "Generating sync verification report..."
    
    REPORT_FILE="sync-verify-report-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$REPORT_FILE" << EOF
Sync Verification Report
Generated: $(date)
========================

1. Overall Status
-----------------
EOF
    
    # Add sync statistics
    mongosh "$MONGODB_URI" --eval "
        const stats = db.productmappings.aggregate([
            {
                \$group: {
                    _id: '\$syncStatus',
                    count: { \$sum: 1 }
                }
            }
        ]).toArray();
        
        stats.forEach(s => {
            print(s._id + ': ' + s.count);
        });
    " --quiet >> "$REPORT_FILE"
    
    echo -e "\n2. Recent Sync Activity\n-----------------------" >> "$REPORT_FILE"
    
    # Add recent activity
    mongosh "$MONGODB_URI" --eval "
        db.inventorytransactions.find({
            syncStatus: 'completed',
            createdAt: { \$gte: new Date(Date.now() - 60*60*1000) }
        }).count()
    " --quiet | xargs -I {} echo "Transactions in last hour: {}" >> "$REPORT_FILE"
    
    log_info "Report saved to: $REPORT_FILE"
}

# Main
main() {
    if verify_sync; then
        log_info "Sync verification passed"
        generate_report
        exit 0
    else
        log_error "Sync verification failed"
        generate_report
        exit 1
    fi
}

main
