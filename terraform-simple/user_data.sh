#!/bin/bash
set -e

# Update system
yum update -y

# Install Docker
yum install -y docker
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Git and Python3
yum install -y git python3 python3-pip
pip3 install 'urllib3<2.0' certbot

# Create application directory
mkdir -p /opt/healthdiary
cd /opt/healthdiary

# Get instance public IP for later use
INSTANCE_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

# Set Duck DNS variables from Terraform
export DUCKDNS_TOKEN="${duckdns_token}"
export DUCKDNS_SUBDOMAIN="${duckdns_subdomain}"

# Clone the full repository
git clone https://github.com/michaeltlewis/healthdiary.git .

# Create environment file for the server
mkdir -p server
cat > server/.env << EOF
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://${duckdns_subdomain}.duckdns.org

# JWT Configuration
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# Database Configuration
DATABASE_PATH=./data/healthdiary.db

# AWS Configuration (will be set from IAM role)
AWS_REGION=eu-west-2
S3_BUCKET_NAME=healthdiary-${duckdns_subdomain}-audio

# Anthropic Configuration (you'll need to set this manually)
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# File Upload Configuration
MAX_FILE_SIZE=50MB
ALLOWED_AUDIO_TYPES=audio/wav,audio/mp3,audio/mp4,audio/webm,audio/ogg

# Scheduler Configuration
SCHEDULER_INTERVAL_MS=60000
EOF

# Build the full stack application
docker build -t healthdiary-app .

# Create SSL setup script
cat > setup-ssl.sh << 'EOF'
#!/bin/bash
set -e

# Check if Duck DNS token and subdomain are provided
if [ -z "$DUCKDNS_TOKEN" ] || [ -z "$DUCKDNS_SUBDOMAIN" ]; then
    echo "WARNING: DUCKDNS_TOKEN and DUCKDNS_SUBDOMAIN not set."
    echo "SSL certificates will not be generated automatically."
    echo "Using HTTP-only deployment."
    USE_SSL=false
else
    echo "Duck DNS configuration found. Setting up SSL..."
    USE_SSL=true
    
    # Update Duck DNS
    curl -s "https://www.duckdns.org/update?domains=$DUCKDNS_SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=$INSTANCE_IP"
    
    # Wait for DNS propagation
    echo "Waiting for DNS propagation..."
    sleep 30
    
    # Stop any running containers to free port 80 for certbot
    docker stop healthdiary || true
    docker rm healthdiary || true
    
    # Generate Let's Encrypt certificate
    /usr/local/bin/certbot certonly --standalone --preferred-challenges http \
        -d $DUCKDNS_SUBDOMAIN.duckdns.org --non-interactive --agree-tos \
        --email noreply@$DUCKDNS_SUBDOMAIN.duckdns.org
    
    # Copy certificates to application directory
    mkdir -p ssl
    cp /etc/letsencrypt/live/$DUCKDNS_SUBDOMAIN.duckdns.org/fullchain.pem ssl/letsencrypt.crt
    cp /etc/letsencrypt/live/$DUCKDNS_SUBDOMAIN.duckdns.org/privkey.pem ssl/letsencrypt.key
    
    # Create nginx config for SSL
    mkdir -p nginx
    cat > nginx/nginx.conf << 'NGINX_EOF'
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server healthdiary:3000;
    }
    
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }
    
    server {
        listen 443 ssl;
        server_name _;
        
        ssl_certificate /app/ssl/letsencrypt.crt;
        ssl_private_key /app/ssl/letsencrypt.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        
        client_max_body_size 50M;
        
        location / {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        location /health {
            access_log off;
            return 200 "healthy";
            add_header Content-Type text/plain;
        }
    }
}
NGINX_EOF
    
    # Create docker-compose file for SSL setup
    cat > docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'
services:
  healthdiary:
    image: healthdiary-app
    container_name: healthdiary
    restart: unless-stopped
    volumes:
      - ./server/data:/app/server/data
    environment:
      - NODE_ENV=production
      - PORT=3000
    networks:
      - healthdiary_network
  
  nginx:
    image: nginx:alpine
    container_name: healthdiary_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/app/ssl:ro
    depends_on:
      - healthdiary
    networks:
      - healthdiary_network

networks:
  healthdiary_network:
    driver: bridge
COMPOSE_EOF
    
    # Start with SSL
    docker-compose up -d
    
    # Set up auto-renewal
    echo "0 2 * * * /usr/local/bin/certbot renew --quiet --deploy-hook \"cp /etc/letsencrypt/live/$DUCKDNS_SUBDOMAIN.duckdns.org/fullchain.pem /opt/healthdiary/ssl/letsencrypt.crt && cp /etc/letsencrypt/live/$DUCKDNS_SUBDOMAIN.duckdns.org/privkey.pem /opt/healthdiary/ssl/letsencrypt.key && cd /opt/healthdiary && docker-compose restart nginx\"" | crontab -
    
    echo "Health Diary deployed with SSL at https://$DUCKDNS_SUBDOMAIN.duckdns.org"
else
    # HTTP-only deployment
    docker run -d --name healthdiary --restart unless-stopped \
        -p 80:3000 \
        -v /opt/healthdiary/server/data:/app/server/data \
        healthdiary-app
    
    echo "Health Diary deployed with HTTP at http://$INSTANCE_IP"
    echo "For SSL support, set DUCKDNS_TOKEN and DUCKDNS_SUBDOMAIN environment variables and redeploy."
fi
EOF

chmod +x setup-ssl.sh

# Create update script
cat > update.sh << 'EOF'
#!/bin/bash
echo "Updating Health Diary application..."

# Pull latest code
git pull origin main

# Rebuild the application
docker build -t healthdiary-app .

# Check if using SSL (docker-compose) or HTTP-only
if [ -f "docker-compose.yml" ]; then
    echo "Updating with SSL support..."
    docker-compose down
    docker-compose up -d
    echo "Application updated with SSL support"
else
    echo "Updating HTTP-only deployment..."
    docker stop healthdiary || true
    docker rm healthdiary || true
    docker run -d --name healthdiary --restart unless-stopped \
        -p 80:3000 \
        -v /opt/healthdiary/server/data:/app/server/data \
        healthdiary-app
    echo "Application updated (HTTP-only)"
fi

echo "Update complete!"
EOF

chmod +x update.sh

# Create API key configuration script
cat > set-api-keys.sh << 'EOF'
#!/bin/bash

echo "Health Diary API Key Configuration"
echo "=================================="
echo ""
echo "Please set your API keys in the server/.env file:"
echo ""
echo "1. ANTHROPIC_API_KEY - Your Anthropic Claude API key"
echo "   Get it from: https://console.anthropic.com/"
echo ""
echo "2. AWS credentials are automatically configured via IAM role"
echo ""
echo "To edit the configuration file:"
echo "   sudo nano /opt/healthdiary/server/.env"
echo ""
echo "After setting the keys, restart the application:"
if [ -f "docker-compose.yml" ]; then
    echo "   sudo docker-compose restart"
else
    echo "   sudo docker restart healthdiary"
fi
echo ""
echo "Current .env file location: /opt/healthdiary/server/.env"
EOF

chmod +x set-api-keys.sh

# Run SSL setup
./setup-ssl.sh

# Change ownership to ec2-user
chown -R ec2-user:ec2-user /opt/healthdiary

# Log completion
echo "Health Diary application deployed successfully" > /var/log/healthdiary-deploy.log
echo "Full-stack application with AI integration ready" >> /var/log/healthdiary-deploy.log
echo "Run: /opt/healthdiary/set-api-keys.sh to configure API keys" >> /var/log/healthdiary-deploy.log
date >> /var/log/healthdiary-deploy.log