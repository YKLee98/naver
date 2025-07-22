#!/bin/bash
# scripts/deploy/deploy-backend.sh

set -e

ENVIRONMENT=${1:-staging}
REGION=${AWS_REGION:-ap-northeast-2}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/hallyu-${ENVIRONMENT}-backend"
IMAGE_TAG=$(git rev-parse --short HEAD)

log_info() {
    echo "[INFO] $1"
}

# Build Docker image
log_info "Building Docker image..."
docker build \
    -f infrastructure/docker/backend/Dockerfile \
    -t ${ECR_REPOSITORY}:${IMAGE_TAG} \
    -t ${ECR_REPOSITORY}:latest \
    --target production \
    .

# Login to ECR
log_info "Logging in to ECR..."
aws ecr get-login-password --region ${REGION} | \
    docker login --username AWS --password-stdin ${ECR_REPOSITORY}

# Create repository if it doesn't exist
aws ecr describe-repositories --repository-names hallyu-${ENVIRONMENT}-backend --region ${REGION} || \
    aws ecr create-repository --repository-name hallyu-${ENVIRONMENT}-backend --region ${REGION}

# Push image
log_info "Pushing Docker image..."
docker push ${ECR_REPOSITORY}:${IMAGE_TAG}
docker push ${ECR_REPOSITORY}:latest

# Update ECS service
log_info "Updating ECS service..."
aws ecs update-service \
    --cluster hallyu-${ENVIRONMENT}-cluster \
    --service hallyu-${ENVIRONMENT}-backend \
    --force-new-deployment \
    --region ${REGION}

# Wait for deployment to complete
log_info "Waiting for deployment to complete..."
aws ecs wait services-stable \
    --cluster hallyu-${ENVIRONMENT}-cluster \
    --services hallyu-${ENVIRONMENT}-backend \
    --region ${REGION}

log_info "Backend deployment completed"

