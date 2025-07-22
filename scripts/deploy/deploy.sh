#!/bin/bash
# scripts/deploy/deploy.sh - 메인 배포 스크립트

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENVIRONMENT=${1:-staging}
REGION=${AWS_REGION:-ap-northeast-2}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials are not configured"
        exit 1
    fi
    
    log_info "All prerequisites are met"
}

build_packages() {
    log_info "Building packages..."
    
    cd "${PROJECT_ROOT}"
    
    # Install dependencies
    pnpm install --frozen-lockfile
    
    # Build shared package
    cd packages/shared
    pnpm build
    
    # Build backend
    cd ../backend
    pnpm build
    
    # Build frontend
    cd ../frontend
    pnpm build
    
    cd "${PROJECT_ROOT}"
    log_info "Packages built successfully"
}

deploy_infrastructure() {
    log_info "Deploying infrastructure..."
    
    cd "${PROJECT_ROOT}/infrastructure/aws/cloudformation"
    
    # Deploy main stack
    aws cloudformation deploy \
        --template-file main.yaml \
        --stack-name hallyu-${ENVIRONMENT} \
        --parameter-overrides \
            EnvironmentName=${ENVIRONMENT} \
        --capabilities CAPABILITY_NAMED_IAM \
        --region ${REGION}
    
    log_info "Infrastructure deployed successfully"
}

deploy_backend() {
    log_info "Deploying backend..."
    
    "${SCRIPT_DIR}/deploy-backend.sh" ${ENVIRONMENT}
    
    log_info "Backend deployed successfully"
}

deploy_frontend() {
    log_info "Deploying frontend..."
    
    "${SCRIPT_DIR}/deploy-frontend.sh" ${ENVIRONMENT}
    
    log_info "Frontend deployed successfully"
}

deploy_lambda() {
    log_info "Deploying Lambda functions..."
    
    "${SCRIPT_DIR}/deploy-lambda.sh" ${ENVIRONMENT}
    
    log_info "Lambda functions deployed successfully"
}

run_post_deployment() {
    log_info "Running post-deployment tasks..."
    
    # Run database migrations
    cd "${PROJECT_ROOT}/packages/backend"
    NODE_ENV=production npm run migrate
    
    # Seed initial data if needed
    if [ "${ENVIRONMENT}" = "development" ]; then
        NODE_ENV=production npm run seed
    fi
    
    # Verify deployment
    HEALTH_CHECK_URL=$(aws cloudformation describe-stacks \
        --stack-name hallyu-${ENVIRONMENT} \
        --query 'Stacks[0].Outputs[?OutputKey==`ALBEndpoint`].OutputValue' \
        --output text \
        --region ${REGION})/api/v1/health
    
    if curl -f "${HEALTH_CHECK_URL}" > /dev/null 2>&1; then
        log_info "Health check passed"
    else
        log_error "Health check failed"
        exit 1
    fi
    
    log_info "Post-deployment tasks completed"
}

# Main deployment flow
main() {
    log_info "Starting deployment for environment: ${ENVIRONMENT}"
    
    check_prerequisites
    build_packages
    deploy_infrastructure
    deploy_backend
    deploy_frontend
    deploy_lambda
    run_post_deployment
    
    log_info "Deployment completed successfully!"
    log_info "Application URL: https://${ENVIRONMENT}.hallyu-pomaholic.com"
}

# Run main function
main

