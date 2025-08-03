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

# Install Python3 and certbot for SSL certificates
yum install -y python3 python3-pip
pip3 install 'urllib3<2.0' certbot

# Create application directory
mkdir -p /opt/healthdiary
cd /opt/healthdiary

# Get instance public IP for later use
INSTANCE_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

# Set Duck DNS variables from Terraform
export DUCKDNS_TOKEN="${duckdns_token}"
export DUCKDNS_SUBDOMAIN="${duckdns_subdomain}"

# Copy current HTML file from repository
curl -s https://raw.githubusercontent.com/michaeltlewis/healthdiary/main/app/index.html > index.html

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
    cp /etc/letsencrypt/live/$DUCKDNS_SUBDOMAIN.duckdns.org/fullchain.pem /opt/healthdiary/letsencrypt.crt
    cp /etc/letsencrypt/live/$DUCKDNS_SUBDOMAIN.duckdns.org/privkey.pem /opt/healthdiary/letsencrypt.key
    chown ec2-user:ec2-user /opt/healthdiary/letsencrypt.*
    
    # Set up auto-renewal
    echo "0 2 * * * /usr/local/bin/certbot renew --quiet --deploy-hook \"docker stop healthdiary && cp /etc/letsencrypt/live/$DUCKDNS_SUBDOMAIN.duckdns.org/fullchain.pem /opt/healthdiary/letsencrypt.crt && cp /etc/letsencrypt/live/$DUCKDNS_SUBDOMAIN.duckdns.org/privkey.pem /opt/healthdiary/letsencrypt.key && cd /opt/healthdiary && docker build -t healthdiary-app . && docker run -d --name healthdiary --restart unless-stopped -p 80:80 -p 443:443 healthdiary-app\"" | crontab -
fi

# Create appropriate Dockerfile based on SSL availability
if [ "$USE_SSL" = true ]; then
    cat > Dockerfile << 'DOCKERFILE_EOF'
FROM nginx:alpine

# Copy custom HTML file
COPY index.html /usr/share/nginx/html/index.html

# Copy SSL certificates
COPY letsencrypt.crt /etc/nginx/ssl/server.crt
COPY letsencrypt.key /etc/nginx/ssl/server.key

# Create SSL directory
RUN mkdir -p /etc/nginx/ssl

# Create nginx config with HTTPS
RUN echo 'server { \
    listen 80; \
    server_name DUCKDNS_DOMAIN _; \
    return 301 https://DUCKDNS_DOMAIN$request_uri; \
} \
server { \
    listen 443 ssl; \
    server_name DUCKDNS_DOMAIN _; \
    \
    ssl_certificate /etc/nginx/ssl/server.crt; \
    ssl_certificate_key /etc/nginx/ssl/server.key; \
    ssl_protocols TLSv1.2 TLSv1.3; \
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384; \
    ssl_prefer_server_ciphers off; \
    \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    \
    location /health { \
        access_log off; \
        return 200 "healthy"; \
        add_header Content-Type text/plain; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
DOCKERFILE_EOF
    
    # Replace placeholder with actual domain
    sed -i "s/DUCKDNS_DOMAIN/$DUCKDNS_SUBDOMAIN.duckdns.org/g" Dockerfile
    
    # Build and run with SSL
    docker build -t healthdiary-app .
    docker run -d --name healthdiary --restart unless-stopped -p 80:80 -p 443:443 healthdiary-app
    
    echo "Health Diary deployed with SSL at https://$DUCKDNS_SUBDOMAIN.duckdns.org"
else
    # HTTP-only deployment
    cat > Dockerfile << 'DOCKERFILE_EOF'
FROM nginx:alpine

# Copy custom HTML file
COPY index.html /usr/share/nginx/html/index.html

# Create basic nginx config
RUN echo 'server { \
    listen 80; \
    server_name _; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /health { \
        access_log off; \
        return 200 "healthy"; \
        add_header Content-Type text/plain; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
DOCKERFILE_EOF
    
    # Build and run HTTP-only
    docker build -t healthdiary-app .
    docker run -d --name healthdiary --restart unless-stopped -p 80:80 healthdiary-app
    
    echo "Health Diary deployed with HTTP at http://$INSTANCE_IP"
    echo "For SSL support, set DUCKDNS_TOKEN and DUCKDNS_SUBDOMAIN environment variables and redeploy."
fi
EOF

chmod +x setup-ssl.sh

# Create update script
cat > update.sh << 'EOF'
#!/bin/bash
echo "Updating Heath Diary application..."

# Download latest HTML
curl -s https://raw.githubusercontent.com/michaeltlewis/healthdiary/main/app/index.html > index.html

# Rebuild and restart
docker stop healthdiary || true
docker rm healthdiary || true
docker build -t healthdiary-app .

# Check if SSL certificates exist
if [ -f "letsencrypt.crt" ] && [ -f "letsencrypt.key" ]; then
    docker run -d --name healthdiary --restart unless-stopped -p 80:80 -p 443:443 healthdiary-app
    echo "Application updated with SSL support"
else
    docker run -d --name healthdiary --restart unless-stopped -p 80:80 healthdiary-app
    echo "Application updated (HTTP-only)"
fi
EOF

chmod +x update.sh

# Run SSL setup
./setup-ssl.sh

# Log completion
echo "Health Diary application deployed successfully" > /var/log/healthdiary-deploy.log
date >> /var/log/healthdiary-deploy.log