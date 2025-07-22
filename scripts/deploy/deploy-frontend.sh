# scripts/deploy/deploy-frontend.sh

set -e

ENVIRONMENT=${1:-staging}
REGION=${AWS_REGION:-ap-northeast-2}
S3_BUCKET="hallyu-${ENVIRONMENT}-frontend"
CLOUDFRONT_DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name hallyu-${ENVIRONMENT} \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text \
    --region ${REGION})

log_info() {
    echo "[INFO] $1"
}

# Build frontend
log_info "Building frontend..."
cd packages/frontend
pnpm build

# Create S3 bucket if it doesn't exist
aws s3api head-bucket --bucket ${S3_BUCKET} 2>/dev/null || \
    aws s3api create-bucket \
        --bucket ${S3_BUCKET} \
        --region ${REGION} \
        --create-bucket-configuration LocationConstraint=${REGION}

# Configure bucket for static website hosting
aws s3api put-bucket-website \
    --bucket ${S3_BUCKET} \
    --website-configuration '{
        "IndexDocument": {"Suffix": "index.html"},
        "ErrorDocument": {"Key": "index.html"}
    }'

# Upload files to S3
log_info "Uploading files to S3..."
aws s3 sync dist/ s3://${S3_BUCKET}/ \
    --delete \
    --cache-control "public, max-age=31536000" \
    --exclude "index.html" \
    --exclude "*.json"

# Upload index.html with no-cache
aws s3 cp dist/index.html s3://${S3_BUCKET}/ \
    --cache-control "no-cache, no-store, must-revalidate"

# Upload other files with appropriate cache headers
aws s3 cp dist/ s3://${S3_BUCKET}/ \
    --recursive \
    --exclude "*" \
    --include "*.json" \
    --cache-control "no-cache"

# Invalidate CloudFront cache
if [ -n "${CLOUDFRONT_DISTRIBUTION_ID}" ]; then
    log_info "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} \
        --paths "/*"
fi

log_info "Frontend deployment completed"

