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

# Create application directory
mkdir -p /opt/healthdiary
cd /opt/healthdiary

# Create our custom HTML file
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Health Diary - Simple Deployment</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #333;
            margin-bottom: 20px;
            font-size: 2.5em;
        }
        p {
            color: #666;
            font-size: 1.2em;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .status {
            background: #e8f5e8;
            color: #2d7d2d;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-weight: bold;
        }
        .cost-savings {
            background: #fff3cd;
            color: #856404;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-weight: bold;
        }
        .features {
            text-align: left;
            margin: 30px 0;
        }
        .features ul {
            list-style: none;
            padding: 0;
        }
        .features li {
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }
        .features li:last-child {
            border-bottom: none;
        }
        .footer {
            margin-top: 30px;
            font-size: 0.9em;
            color: #999;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Health Diary</h1>
        <div class="status">
            Simple EC2 Deployment Successful!
        </div>
        <div class="cost-savings">
            Cost-Optimized: ~$5-10/month (vs $90-180/month)
        </div>
        <p>Your Health Diary application is now running on a single EC2 instance with Docker.</p>
        
        <div class="features">
            <h3>Current Setup:</h3>
            <ul>
                <li>Single t3.micro EC2 instance (Free Tier eligible)</li>
                <li>Docker containerized application</li>
                <li>Direct public IP access</li>
                <li>Minimal AWS costs</li>
            </ul>
        </div>
        
        <div class="features">
            <h3>Coming Soon:</h3>
            <ul>
                <li>Voice recording and transcription</li>
                <li>AI-powered health analysis</li>
                <li>Secure user authentication</li>
                <li>Personalized health tracking</li>
            </ul>
        </div>
        
        <div class="footer">
            <p>Built with AWS EC2, Docker, and cost optimization in mind</p>
        </div>
    </div>
</body>
</html>
EOF

# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM nginx:alpine

# Copy custom HTML file
COPY index.html /usr/share/nginx/html/index.html

# Create a custom nginx config
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
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
EOF

# Build and run the container
docker build -t healthdiary-app .
docker run -d --name healthdiary --restart unless-stopped -p 80:80 healthdiary-app

# Create a simple update script
cat > update.sh << 'EOF'
#!/bin/bash
docker stop healthdiary || true
docker rm healthdiary || true
docker build -t healthdiary-app .
docker run -d --name healthdiary --restart unless-stopped -p 80:80 healthdiary-app
echo "Application updated and restarted"
EOF

chmod +x update.sh

# Log completion
echo "Health Diary application deployed successfully" > /var/log/healthdiary-deploy.log
date >> /var/log/healthdiary-deploy.log