#!/bin/bash
# scripts/deploy/rollback.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-staging}
VERSION=${2:-}

if [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Version not specified${NC}"
    echo "Usage: $0 <environment> <version>"
    echo "Example: $0 production v1.2.3"
    exit 1
fi

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Rollback ECS service
rollback_ecs() {
    log_info "Rolling back ECS service to version $VERSION..."
    
    # Get task definition ARN for the version
    TASK_DEF_ARN=$(aws ecs describe-task-definition \
        --task-definition hallyu-${ENVIRONMENT}-backend:${VERSION} \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    if [ -z "$TASK_DEF_ARN" ]; then
        log_error "Task definition not found for version $VERSION"
        exit 1
    fi
    
    # Update service
    aws ecs update-service \
        --cluster hallyu-${ENVIRONMENT}-cluster \
        --service hallyu-${ENVIRONMENT}-backend \
        --task-definition $TASK_DEF_ARN \
        --force-new-deployment
    
    log_info "Waiting for rollback to complete..."
    aws ecs wait services-stable \
        --cluster hallyu-${ENVIRONMENT}-cluster \
        --services hallyu-${ENVIRONMENT}-backend
}

# Rollback Lambda functions
rollback_lambda() {
    log_info "Rolling back Lambda functions to version $VERSION..."
    
    FUNCTIONS=(
        "webhook-handler"
        "sync-scheduler"
        "inventory-updater"
        "price-calculator"
        "dlq-processor"
    )
    
    for func in "${FUNCTIONS[@]}"; do
        log_info "Rolling back $func..."
        
        # Get version ARN
        VERSION_ARN=$(aws lambda get-function \
            --function-name hallyu-${ENVIRONMENT}-${func} \
            --qualifier $VERSION \
            --query 'Configuration.FunctionArn' \
            --output text 2>/dev/null)
        
        if [ -z "$VERSION_ARN" ]; then
            log_warning "Version $VERSION not found for $func, skipping..."
            continue
        fi
        
        # Update alias to point to version
        aws lambda update-alias \
            --function-name hallyu-${ENVIRONMENT}-${func} \
            --name live \
            --function-version $VERSION
    done
}

# Rollback frontend
rollback_frontend() {
    log_info "Rolling back frontend to version $VERSION..."
    
    S3_BUCKET="hallyu-${ENVIRONMENT}-frontend"
    
    # Check if version exists
    if ! aws s3 ls s3://${S3_BUCKET}/versions/${VERSION}/ > /dev/null 2>&1; then
        log_error "Frontend version $VERSION not found"
        exit 1
    fi
    
    # Sync version to root
    aws s3 sync s3://${S3_BUCKET}/versions/${VERSION}/ s3://${S3_BUCKET}/ \
        --delete \
        --exclude "versions/*"
    
    # Invalidate CloudFront
    DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
        --stack-name hallyu-${ENVIRONMENT} \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
        --output text)
    
    if [ -n "$DISTRIBUTION_ID" ]; then
        aws cloudfront create-invalidation \
            --distribution-id $DISTRIBUTION_ID \
            --paths "/*"
    fi
}

# Main rollback process
main() {
    log_info "Starting rollback to version $VERSION for environment: $ENVIRONMENT"
    
    # Confirm rollback
    echo -e "${YELLOW}WARNING: This will rollback all services to version $VERSION${NC}"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "Rollback cancelled"
        exit 0
    fi
    
    # Perform rollback
    rollback_ecs
    rollback_lambda
    rollback_frontend
    
    # Verify rollback
    log_info "Verifying rollback..."
    ./scripts/utils/health-check.sh
    
    log_info "Rollback completed successfully!"
}

main
