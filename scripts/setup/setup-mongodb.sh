
#!/bin/bash
# MongoDB setup script for local development

set -e

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1"
}

# Check if MongoDB is installed
if ! command -v mongosh &> /dev/null; then
    log_error "MongoDB Shell (mongosh) is not installed"
    log_info "Installing MongoDB..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew tap mongodb/brew
        brew install mongodb-community
        brew services start mongodb-community
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
        echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
        sudo apt-get update
        sudo apt-get install -y mongodb-org
        sudo systemctl start mongod
    else
        log_error "Unsupported operating system"
        exit 1
    fi
fi

# Wait for MongoDB to be ready
log_info "Waiting for MongoDB to be ready..."
while ! mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
    sleep 1
done

log_info "MongoDB is ready"

# Run initialization script
log_info "Running MongoDB initialization script..."
mongosh < scripts/mongo-init.js

log_info "MongoDB setup completed"

