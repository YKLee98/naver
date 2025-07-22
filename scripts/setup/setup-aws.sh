#!/bin/bash
# scripts/setup/setup-aws.sh

set -e

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1"
}

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed"
    log_info "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

# Configure AWS credentials
log_info "Configuring AWS credentials..."
aws configure

# Verify credentials
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials are not valid"
    exit 1
fi

# Get AWS account info
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)

log_info "AWS Account ID: $AWS_ACCOUNT_ID"
log_info "AWS Region: $AWS_REGION"

# Create S3 buckets
log_info "Creating S3 buckets..."

BUCKETS=(
    "hallyu-${ENVIRONMENT:-dev}-lambda-artifacts"
    "hallyu-${ENVIRONMENT:-dev}-frontend"
    "hallyu-${ENVIRONMENT:-dev}-backups"
)

for bucket in "${BUCKETS[@]}"; do
    if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
        log_info "Bucket $bucket already exists"
    else
        aws s3api create-bucket \
            --bucket "$bucket" \
            --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION"
        log_info "Created bucket: $bucket"
    fi
done

# Create ECR repositories
log_info "Creating ECR repositories..."

REPOS=(
    "hallyu-${ENVIRONMENT:-dev}-backend"
    "hallyu-${ENVIRONMENT:-dev}-nginx"
)

for repo in "${REPOS[@]}"; do
    if aws ecr describe-repositories --repository-names "$repo" --region "$AWS_REGION" 2>/dev/null; then
        log_info "Repository $repo already exists"
    else
        aws ecr create-repository --repository-name "$repo" --region "$AWS_REGION"
        log_info "Created repository: $repo"
    fi
done

# Create Secrets Manager secrets
log_info "Creating placeholder secrets..."

SECRETS=(
    "${ENVIRONMENT:-dev}/mongodb"
    "${ENVIRONMENT:-dev}/redis"
    "${ENVIRONMENT:-dev}/naver"
    "${ENVIRONMENT:-dev}/shopify"
    "${ENVIRONMENT:-dev}/exchange-rate"
)

for secret in "${SECRETS[@]}"; do
    if aws secretsmanager describe-secret --secret-id "$secret" --region "$AWS_REGION" 2>/dev/null; then
        log_info "Secret $secret already exists"
    else
        aws secretsmanager create-secret \
            --name "$secret" \
            --secret-string '{"placeholder": "update-me"}' \
            --region "$AWS_REGION"
        log_info "Created secret: $secret"
    fi
done

log_info "AWS setup completed!"
log_info "Next steps:"
log_info "1. Update secrets in AWS Secrets Manager"
log_info "2. Deploy infrastructure: ./scripts/deploy/deploy.sh"

