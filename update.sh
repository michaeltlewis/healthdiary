#!/bin/bash

set -e

echo "Health Diary Application Update Script"
echo "======================================"
echo ""

# Check if we're in the right directory
if [ ! -f "Dockerfile" ] || [ ! -d "terraform-simple" ]; then
    echo "❌ Error: This script should be run from the Health Diary application directory"
    echo "   Expected files: Dockerfile, terraform-simple/"
    exit 1
fi

echo "📂 Current directory: $(pwd)"
echo ""

# Pull latest code from GitHub
echo "📥 Pulling latest code from GitHub..."
git pull origin main

if [ $? -eq 0 ]; then
    echo "✅ Code updated successfully"
else
    echo "❌ Failed to pull latest code"
    exit 1
fi

echo ""

# Check if this is a local environment or if we need to deploy to remote
if command -v docker >/dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    # Local environment with Docker
    echo "🔨 Rebuilding Docker image locally..."
    docker build -t healthdiary-app .

if [ $? -eq 0 ]; then
    echo "✅ Docker image rebuilt successfully"
else
    echo "❌ Failed to rebuild Docker image"
    exit 1
fi

echo ""

# Check deployment type and restart appropriately
if [ -f "docker-compose.yml" ]; then
    echo "🔄 Restarting with SSL support (docker-compose)..."
    
    # Use full path to docker-compose
    DOCKER_COMPOSE="/usr/local/bin/docker-compose"
    
    if [ ! -f "$DOCKER_COMPOSE" ]; then
        echo "⚠️  docker-compose not found at $DOCKER_COMPOSE, trying system path..."
        DOCKER_COMPOSE="docker-compose"
    fi
    
    $DOCKER_COMPOSE down
    if [ $? -eq 0 ]; then
        echo "✅ Containers stopped successfully"
    else
        echo "⚠️  Warning: Error stopping containers (might not have been running)"
    fi
    
    $DOCKER_COMPOSE up -d
    if [ $? -eq 0 ]; then
        echo "✅ Containers started successfully"
    else
        echo "❌ Failed to start containers"
        exit 1
    fi
    
    echo "🌐 Application updated with SSL support"
    
else
    echo "🔄 Restarting HTTP-only deployment..."
    
    # Stop and remove existing container
    docker stop healthdiary 2>/dev/null || echo "Container 'healthdiary' was not running"
    docker rm healthdiary 2>/dev/null || echo "Container 'healthdiary' did not exist"
    
    # Start new container
    docker run -d --name healthdiary --restart unless-stopped \
        -p 80:3000 \
        -v "$(pwd)/server/data:/app/server/data" \
        healthdiary-app
    
    if [ $? -eq 0 ]; then
        echo "✅ HTTP-only deployment restarted successfully"
    else
        echo "❌ Failed to restart HTTP-only deployment"
        exit 1
    fi
fi

echo ""

# Wait a moment for containers to start
echo "⏳ Waiting for application to start..."
sleep 5

# Health check
echo "🏥 Performing health check..."
if command -v curl >/dev/null 2>&1; then
    if [ -f "docker-compose.yml" ]; then
        # SSL deployment
        HEALTH_URL="https://$(hostname -f)/api/health"
        # Fallback to localhost if hostname fails
        if ! curl -s -k "$HEALTH_URL" >/dev/null 2>&1; then
            HEALTH_URL="https://localhost/api/health"
        fi
    else
        # HTTP deployment
        HEALTH_URL="http://localhost/api/health"
    fi
    
    HEALTH_RESPONSE=$(curl -s -k "$HEALTH_URL" 2>/dev/null || echo "")
    
    if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
        echo "✅ Health check passed - Application is running"
        echo "   Response: $HEALTH_RESPONSE"
    else
        echo "⚠️  Health check inconclusive"
        echo "   You may need to wait a few more seconds for the application to fully start"
    fi
else
    echo "ℹ️  curl not available - skipping health check"
fi

echo ""
echo "🎉 Update completed successfully!"
echo ""
echo "📊 Container status:"
docker ps --filter "name=healthdiary" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "📝 To view logs:"
echo "   sudo docker logs healthdiary"
echo ""
echo "🌍 Access your application at:"
if [ -f "docker-compose.yml" ]; then
    echo "   https://$(hostname -f 2>/dev/null || echo 'your-domain')"
else
    echo "   http://$(hostname -f 2>/dev/null || echo 'your-server-ip')"
fi