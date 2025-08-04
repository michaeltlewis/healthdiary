#!/bin/bash
set -e

# Script to add SSL/HTTPS support to existing Health Diary deployment
echo "Adding SSL/HTTPS support to Health Diary deployment..."

# Load Duck DNS configuration
if [ -f ".env" ]; then
    source .env
    echo "✓ Loaded Duck DNS configuration from .env"
else
    echo "❌ No .env file found. Please create one with DUCKDNS_TOKEN and DUCKDNS_SUBDOMAIN"
    exit 1
fi

# Validate required variables
if [ -z "$DUCKDNS_TOKEN" ] || [ -z "$DUCKDNS_SUBDOMAIN" ]; then
    echo "❌ DUCKDNS_TOKEN and DUCKDNS_SUBDOMAIN must be set in .env file"
    exit 1
fi

# Get current instance IP (you'll need to update this)
INSTANCE_IP="35.177.70.74"  # Current deployment IP
echo "Using instance IP: $INSTANCE_IP"

# Run SSL setup on the server
echo "Setting up SSL certificates and nginx proxy..."
ssh -i ~/.ssh/healthdiary-key -o StrictHostKeyChecking=no ec2-user@$INSTANCE_IP << EOF
set -e
cd /opt/healthdiary

# Set environment variables
export DUCKDNS_TOKEN="$DUCKDNS_TOKEN"
export DUCKDNS_SUBDOMAIN="$DUCKDNS_SUBDOMAIN"
export INSTANCE_IP="$INSTANCE_IP"

# Stop current HTTP-only container
echo "Stopping current HTTP-only container..."
sudo docker stop healthdiary || true
sudo docker rm healthdiary || true

# Update Duck DNS
echo "Updating Duck DNS record..."
curl -s "https://www.duckdns.org/update?domains=\$DUCKDNS_SUBDOMAIN&token=\$DUCKDNS_TOKEN&ip=\$INSTANCE_IP"

# Wait for DNS propagation
echo "Waiting for DNS propagation..."
sleep 30

# Generate SSL certificate
echo "Generating SSL certificate..."
sudo /usr/local/bin/certbot certonly --standalone --preferred-challenges http \\
    -d \$DUCKDNS_SUBDOMAIN.duckdns.org --non-interactive --agree-tos \\
    --email noreply@\$DUCKDNS_SUBDOMAIN.duckdns.org

# Copy certificates
echo "Setting up SSL certificates..."
sudo mkdir -p ssl nginx
sudo cp /etc/letsencrypt/live/\$DUCKDNS_SUBDOMAIN.duckdns.org/fullchain.pem ssl/letsencrypt.crt
sudo cp /etc/letsencrypt/live/\$DUCKDNS_SUBDOMAIN.duckdns.org/privkey.pem ssl/letsencrypt.key
sudo chown -R ec2-user:ec2-user ssl nginx

# Create nginx SSL configuration
echo "Creating nginx configuration..."
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
        return 301 https://\\\$host\\\$request_uri;
    }
    
    server {
        listen 443 ssl;
        server_name _;
        
        ssl_certificate /app/ssl/letsencrypt.crt;
        ssl_certificate_key /app/ssl/letsencrypt.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        
        client_max_body_size 50M;
        
        location / {
            proxy_pass http://backend;
            proxy_set_header Host \\\$host;
            proxy_set_header X-Real-IP \\\$remote_addr;
            proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \\\$scheme;
        }
        
        location /health {
            access_log off;
            return 200 "healthy";
            add_header Content-Type text/plain;
        }
    }
}
NGINX_EOF

# Create docker-compose configuration for SSL
echo "Creating docker-compose configuration..."
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
echo "Starting application with SSL support..."
sudo docker-compose up -d

# Set up auto-renewal
echo "Setting up SSL certificate auto-renewal..."
echo "0 2 * * * /usr/local/bin/certbot renew --quiet --deploy-hook \"cp /etc/letsencrypt/live/\$DUCKDNS_SUBDOMAIN.duckdns.org/fullchain.pem /opt/healthdiary/ssl/letsencrypt.crt && cp /etc/letsencrypt/live/\$DUCKDNS_SUBDOMAIN.duckdns.org/privkey.pem /opt/healthdiary/ssl/letsencrypt.key && cd /opt/healthdiary && docker-compose restart nginx\"" | sudo crontab -

echo "✅ SSL setup complete!"
echo "🌐 Application now available at: https://\$DUCKDNS_SUBDOMAIN.duckdns.org"
EOF

echo "✅ SSL setup script completed successfully!"
echo "🌐 Your Health Diary is now available at: https://$DUCKDNS_SUBDOMAIN.duckdns.org"