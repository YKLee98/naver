#!/bin/bash
# scripts/deploy/deploy-lambda.sh

set -e

ENVIRONMENT=${1:-staging}
REGION=${AWS_REGION:-ap-northeast-2}
S3_BUCKET="hallyu-${ENVIRONMENT}-lambda-artifacts"
LAMBDA_DIR="packages/lambda"

log_info() {
    echo "[INFO] $1"
}

# Create S3 bucket for Lambda artifacts if it doesn't exist
aws s3api head-bucket --bucket ${S3_BUCKET} 2>/dev/null || \
    aws s3api create-bucket \
        --bucket ${S3_BUCKET} \
        --region ${REGION} \
        --create-bucket-configuration LocationConstraint=${REGION}

# Build and package Lambda functions
log_info "Building Lambda functions..."

cd ${LAMBDA_DIR}

# Build each function
for function in webhook-handler sync-scheduler inventory-updater price-calculator dlq-processor; do
    log_info "Building ${function}..."
    
    cd ${function}
    
    # Install dependencies
    npm install --production
    
    # Create deployment package
    zip -r ${function}.zip . -x "*.git*" -x "*.md" -x "test/*"
    
    # Upload to S3
    aws s3 cp ${function}.zip s3://${S3_BUCKET}/functions/
    
    # Update Lambda function
    aws lambda update-function-code \
        --function-name hallyu-${ENVIRONMENT}-${function} \
        --s3-bucket ${S3_BUCKET} \
        --s3-key functions/${function}.zip \
        --region ${REGION}
    
    cd ..
done

# Build and upload Lambda layer
log_info "Building Lambda layer..."
cd common-layer/nodejs
npm install --production
cd ..
zip -r common-layer.zip .
aws s3 cp common-layer.zip s3://${S3_BUCKET}/layers/

log_info "Lambda deployment completed"

#!/bin/bash
# scripts/setup/setup-local.sh

set -e

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v pnpm &> /dev/null; then
        log_info "Installing pnpm..."
        npm install -g pnpm
    fi
}

# Setup environment
setup_environment() {
    log_info "Setting up environment..."
    
    # Copy environment files
    if [ ! -f .env ]; then
        cp .env.example .env
        log_info "Created .env file. Please update it with your credentials."
    fi
    
    # Install dependencies
    pnpm install
}

# Start services
start_services() {
    log_info "Starting services..."
    
    # Start Docker containers
    docker-compose up -d mongodb redis
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
}

# Run migrations and seed data
setup_database() {
    log_info "Setting up database..."
    
    cd packages/backend
    
    # Run migrations
    npm run migrate
    
    # Seed development data
    npm run seed:dev
    
    cd ../..
}

# Main
main() {
    log_info "Setting up local development environment..."
    
    check_prerequisites
    setup_environment
    start_services
    setup_database
    
    log_info "Setup completed!"
    log_info "Run 'pnpm dev' to start the development servers"
}

main

