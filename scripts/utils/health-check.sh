
// scripts/utils/health-check.sh
#!/bin/bash
# Health check script for all services

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🏥 Running health checks..."
echo "================================"

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $service_name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓ Healthy${NC}"
        return 0
    else
        echo -e "${RED}✗ Unhealthy (HTTP $response)${NC}"
        return 1
    fi
}

# Function to check database connection
check_database() {
    local db_name=$1
    local connection_string=$2
    
    echo -n "Checking $db_name... "
    
    if mongosh "$connection_string" --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Connected${NC}"
        return 0
    else
        echo -e "${RED}✗ Connection failed${NC}"
        return 1
    fi
}

# Function to check Redis
check_redis() {
    echo -n "Checking Redis... "
    
    if redis-cli -h ${REDIS_HOST:-localhost} -p ${REDIS_PORT:-6379} ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Connected${NC}"
        return 0
    else
        echo -e "${RED}✗ Connection failed${NC}"
        return 1
    fi
}

# Backend API
check_service "Backend API" "${BACKEND_URL:-http://localhost:3000}/api/v1/health"

# Frontend
check_service "Frontend" "${FRONTEND_URL:-http://localhost:5173}"

# MongoDB
check_database "MongoDB" "${MONGODB_URI:-mongodb://localhost:27017/hallyu-pomaholic}"

# Redis
check_redis

# AWS Services (if in production)
if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "\n${YELLOW}AWS Services:${NC}"
    
    # Check SQS
    echo -n "Checking SQS... "
    if aws sqs get-queue-attributes --queue-url "$SQS_QUEUE_URL" --attribute-names All > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Accessible${NC}"
    else
        echo -e "${RED}✗ Not accessible${NC}"
    fi
    
    # Check Lambda functions
    echo -n "Checking Lambda functions... "
    lambda_count=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'hallyu-${ENVIRONMENT}')].FunctionName" --output text | wc -w)
    echo -e "${GREEN}✓ $lambda_count functions found${NC}"
fi

echo -e "\n================================"
echo "Health check completed"

