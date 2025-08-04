# Health Diary Deployment Guide

## Overview

The Health Diary application is deployed as a cost-optimized, full-stack web application on AWS infrastructure. The deployment uses a single EC2 instance with Docker containerization to minimize costs while providing a production-ready environment with SSL/TLS encryption.

## Architecture

### Infrastructure Components
- **Single EC2 instance** (t3.micro) in AWS eu-west-2 (London) region
- **Docker containerized** Node.js application with SQLite database
- **SSL/TLS encryption** via Let's Encrypt certificates
- **Duck DNS** for free domain name and automatic DNS management
- **Nginx reverse proxy** for HTTPS termination and request routing
- **AWS S3** for audio file storage with server-side encryption
- **AWS IAM roles** for secure service access without stored credentials

### Cost Optimization
- **Target cost**: £5-10/month (vs enterprise £200-500/month)
- **Free Tier eligible**: t3.micro instance (£0 first 12 months)
- **No load balancer**: Direct EC2 access saves ~£15/month
- **SQLite database**: File-based storage saves ~£15-30/month vs RDS
- **Default VPC**: No custom networking saves ~£45/month

## Deployment Process

### Prerequisites
- AWS CLI configured with appropriate credentials
- Terraform installed (>= 1.0)
- SSH key pair for EC2 access
- Duck DNS account for SSL certificates (optional but recommended)

### Quick Deployment

1. **Set environment variables**:
```bash
export SSH_PUBLIC_KEY="$(cat ~/.ssh/id_rsa.pub)"
export DUCKDNS_TOKEN="your-duckdns-token"      # Optional for SSL
export DUCKDNS_SUBDOMAIN="your-subdomain"      # Optional for SSL
```

2. **Deploy infrastructure**:
```bash
cd terraform-simple/
./deploy-simple.sh
```

3. **Access application**:
- With SSL: `https://your-subdomain.duckdns.org`
- Without SSL: `http://instance-ip-address`

### Automated Setup Process

The deployment script automatically:
1. **Provisions AWS infrastructure** via Terraform
2. **Installs Docker** and dependencies on EC2 instance
3. **Clones application code** from GitHub repository
4. **Builds Docker image** for the full-stack application
5. **Generates SSL certificates** using Let's Encrypt (if Duck DNS configured)
6. **Configures Nginx** reverse proxy with HTTPS support
7. **Sets up automatic certificate renewal** via cron job
8. **Creates maintenance scripts** for updates and management

## Technical Implementation

### Application Stack
- **Frontend**: React.js with responsive design, served as static files
- **Backend**: Node.js with Express.js REST API
- **Database**: SQLite with encrypted file storage
- **File Storage**: AWS S3 with server-side encryption
- **Speech-to-Text**: Amazon Transcribe API
- **AI Analysis**: Anthropic Claude API

### Container Architecture
```
[Browser] → [Nginx:443] → [Node.js App:3000] → [SQLite Database]
                                           ↓
                                    [AWS S3 Storage]
                                           ↓
                                    [AI Services]
```

### Security Features
- **TLS 1.2/1.3 encryption** with modern cipher suites
- **Let's Encrypt certificates** with automatic renewal
- **AWS IAM roles** for service authentication
- **Encrypted EBS volumes** for instance storage
- **Security groups** with minimal required ports (22, 80, 443)
- **JWT-based authentication** for user sessions

## File Structure

### Application Deployment
```
/opt/healthdiary/
├── server/                    # Node.js backend
│   ├── .env                   # Environment configuration
│   ├── data/                  # SQLite database storage
│   └── package.json           # Dependencies
├── app/                       # Frontend files
├── ssl/                       # SSL certificates
├── nginx/                     # Nginx configuration
├── docker-compose.yml         # SSL deployment config
├── setup-ssl.sh              # SSL setup script
├── update.sh                  # Application update script
└── set-api-keys.sh           # API key configuration
```

### Configuration Files
- **Environment variables**: `/opt/healthdiary/server/.env`
- **SSL certificates**: `/opt/healthdiary/ssl/`
- **Nginx config**: `/opt/healthdiary/nginx/nginx.conf`
- **Docker compose**: `/opt/healthdiary/docker-compose.yml`

## Maintenance Operations

### Application Updates

#### Quick Update Process

For updating the deployed application with the latest code changes:

```bash
# SSH to the deployed server
ssh -i ~/.ssh/healthdiary-key ec2-user@healthdiary-app.duckdns.org

# Navigate to application directory and run update script
cd /opt/healthdiary
sudo ./update.sh
```

#### What the Update Script Does

The automated `update.sh` script:
1. **Pulls latest code** from GitHub repository (`git pull origin main`)
2. **Rebuilds Docker image** with updated application code
3. **Restarts containers** using the appropriate method:
   - SSL deployments: Uses `docker-compose down/up` 
   - HTTP deployments: Stops/starts individual containers
4. **Performs health check** to verify successful deployment
5. **Preserves all data** (SQLite database, S3 files, SSL certificates)
6. **Provides status feedback** with container information and access URLs

#### Manual Update Process (Alternative)

If you prefer manual control or need to troubleshoot:

```bash
# SSH to server
ssh -i ~/.ssh/healthdiary-key ec2-user@healthdiary-app.duckdns.org
cd /opt/healthdiary

# Pull latest changes
git pull origin main

# Rebuild Docker image
sudo docker build -t healthdiary-app .

# Restart (SSL deployment)
sudo /usr/local/bin/docker-compose down
sudo /usr/local/bin/docker-compose up -d

# OR restart (HTTP-only deployment)
sudo docker stop healthdiary && sudo docker rm healthdiary
sudo docker run -d --name healthdiary --restart unless-stopped \
  -p 80:3000 -v /opt/healthdiary/server/data:/app/server/data healthdiary-app
```

### SSL Certificate Management
- **Automatic renewal**: Cron job runs daily at 2 AM
- **Manual renewal**: `sudo /usr/local/bin/certbot renew`
- **Certificate status**: `sudo /usr/local/bin/certbot certificates`

### Monitoring and Logs
- **Application logs**: `sudo docker logs healthdiary`
- **Container status**: `sudo docker ps`
- **Health endpoint**: `https://your-domain.duckdns.org/health`
- **Deployment logs**: `sudo cat /var/log/healthdiary-deploy.log`

### API Key Configuration
```bash
# Configure API keys
sudo /opt/healthdiary/set-api-keys.sh

# Edit configuration
sudo nano /opt/healthdiary/server/.env

# Restart application
sudo docker-compose restart  # SSL deployment
# OR
sudo docker restart healthdiary  # HTTP deployment
```

## Scaling Considerations

### Current Limits
- **Single instance**: No high availability
- **SQLite database**: Limited concurrent users (<10)
- **Local storage**: No redundancy

### Scale-up Triggers
- **>10 concurrent users**: Migrate to RDS database (~£15/month)
- **>100 requests/minute**: Add Application Load Balancer (~£15/month)
- **High availability needs**: Multi-AZ deployment (~£30/month)

### Migration Path
1. **Phase 1**: Current single-instance deployment
2. **Phase 2**: Add RDS when user base grows
3. **Phase 3**: Add load balancer for traffic distribution
4. **Phase 4**: Multi-region deployment for global access

## Troubleshooting

### Common Issues

**SSL Certificate Problems**:
```bash
# Check certificate status
sudo /usr/local/bin/certbot certificates

# Test renewal
sudo /usr/local/bin/certbot renew --dry-run

# Restart services
cd /opt/healthdiary && sudo ./update.sh
```

**Application Not Starting**:
```bash
# Check container logs
sudo docker logs healthdiary

# Verify Docker status
sudo docker ps -a

# Restart application
cd /opt/healthdiary && sudo ./update.sh
```

**DNS Issues**:
```bash
# Test DNS resolution
nslookup your-subdomain.duckdns.org

# Update Duck DNS manually
curl "https://www.duckdns.org/update?domains=YOUR_SUBDOMAIN&token=YOUR_TOKEN"
```

### Emergency Recovery
1. **Instance replacement**: Terraform can recreate infrastructure
2. **Data backup**: SQLite database in `/opt/healthdiary/server/data/`
3. **S3 recovery**: Audio files and transcripts preserved in S3 bucket

## Security Best Practices

### Current Implementation
- ✅ HTTPS/TLS encryption
- ✅ Encrypted EBS volumes
- ✅ IAM roles (no stored AWS keys)
- ✅ JWT authentication
- ✅ Security groups with minimal ports

### Production Hardening (Future)
- Custom VPC with private subnets
- Web Application Firewall (WAF)
- CloudTrail logging
- Regular security updates
- Backup automation

## Cost Monitoring

### Monthly Breakdown
| Component | Cost (Free Tier) | Cost (After 12mo) |
|-----------|-------------------|-------------------|
| EC2 t3.micro | £0 | £7.50 |
| EBS Storage (20GB) | £0 | £2.00 |
| Data Transfer | £0.01-1.00 | £0.01-1.00 |
| **Total** | **£0.01-1.00** | **£9.51-10.50** |

### Cost Optimization Features
- AWS Free Tier utilization
- Minimal resource provisioning
- Efficient Docker containerization
- S3 storage for large files only
- No premium AWS services

This deployment provides a production-ready, secure, and cost-effective foundation for the Health Diary application with clear scaling paths as usage grows.