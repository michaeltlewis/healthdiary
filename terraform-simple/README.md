# Health Diary - Simple Deployment

This directory contains the cost-optimized deployment configuration for the Health Diary application.

## Quick Start

### Prerequisites
- AWS CLI configured with appropriate credentials
- Terraform installed
- SSH key pair for EC2 access

### Basic Deployment (HTTP only)

1. **Set up SSH key:**
```bash
export SSH_PUBLIC_KEY="$(cat ~/.ssh/id_rsa.pub)"
# Or generate a new key:
# ssh-keygen -t rsa -b 2048 -f ~/.ssh/healthdiary_key
# export SSH_PUBLIC_KEY="$(cat ~/.ssh/healthdiary_key.pub)"
```

2. **Deploy:**
```bash
./deploy-simple.sh
```

3. **Access your application:**
- URL will be displayed after deployment
- Example: `http://18.130.249.186`

### SSL Deployment with Duck DNS

For production use with trusted SSL certificates:

1. **Get Duck DNS account and token:**
   - Visit https://www.duckdns.org/
   - Sign in and create a subdomain
   - Copy your token

2. **Set environment variables:**
```bash
export SSH_PUBLIC_KEY="$(cat ~/.ssh/id_rsa.pub)"
export DUCKDNS_TOKEN="your-duckdns-token-here"
export DUCKDNS_SUBDOMAIN="your-subdomain"  # without .duckdns.org
```

3. **Deploy:**
```bash
./deploy-simple.sh
```

4. **Access your application:**
- HTTPS URL: `https://your-subdomain.duckdns.org`
- Trusted SSL certificate (no browser warnings)
- Automatic certificate renewal

## Features

### Automatic Setup
- ✅ EC2 instance with Docker
- ✅ Latest application code from GitHub
- ✅ SSL certificate generation (if Duck DNS configured)
- ✅ Automatic certificate renewal
- ✅ Mobile-optimized voice recording interface

### Cost Optimization
- **~£0-7.50/month** (Free Tier eligible t3.micro)
- Single EC2 instance deployment
- No load balancer or ECS costs
- Minimal AWS resource usage

### Security Features
- HTTPS/TLS encryption (with Duck DNS)
- Security groups with minimal required ports
- Encrypted EBS volumes
- Modern SSL cipher suites

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SSH_PUBLIC_KEY` | Yes | SSH public key for EC2 access |
| `DUCKDNS_TOKEN` | No | Duck DNS token for SSL certificates |
| `DUCKDNS_SUBDOMAIN` | No | Duck DNS subdomain (without .duckdns.org) |

### Terraform Variables

You can also set these in a `terraform.tfvars` file:

```hcl
ssh_public_key = "ssh-rsa AAAAB3NzaC1yc2E..."
duckdns_token = "your-token-here"
duckdns_subdomain = "your-subdomain"
```

## Deployment Architecture

```
[Browser] → [EC2 Instance:80/443] → [Docker/Nginx] → [Static HTML+JS]
     ↓
[Duck DNS] → [Let's Encrypt SSL]
```

### Infrastructure Components
- **VPC**: Uses default VPC (cost optimization)
- **EC2**: Single t3.micro instance (Free Tier eligible)
- **Security Group**: Ports 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **Storage**: 8GB encrypted EBS volume
- **DNS**: Duck DNS free subdomain service
- **SSL**: Let's Encrypt free certificates

## Maintenance

### Update Application
SSH to the instance and run:
```bash
cd /opt/healthdiary
sudo ./update.sh
```

This will:
- Download latest HTML from GitHub
- Rebuild Docker container
- Restart with SSL support (if configured)

### SSL Certificate Renewal
- Automatic renewal via cron job (daily at 2 AM)
- Certificates valid for 90 days
- Zero-downtime renewal process

### Monitoring
- Check application: `https://your-domain.duckdns.org/health`
- View logs: `sudo docker logs healthdiary`
- Container status: `sudo docker ps`

## Troubleshooting

### SSL Certificate Issues
```bash
# Check certificate status
sudo /usr/local/bin/certbot certificates

# Manual renewal
sudo /usr/local/bin/certbot renew --dry-run

# Restart application
cd /opt/healthdiary && sudo ./update.sh
```

### Duck DNS Issues
```bash
# Test DNS resolution
nslookup your-subdomain.duckdns.org

# Update IP manually
curl "https://www.duckdns.org/update?domains=your-subdomain&token=your-token&ip=your-ip"
```

### Container Issues
```bash
# Check container status
sudo docker ps -a

# View logs
sudo docker logs healthdiary

# Restart container
cd /opt/healthdiary && sudo ./update.sh
```

## Cost Breakdown

| Component | Monthly Cost |
|-----------|--------------|
| EC2 t3.micro (Free Tier) | £0 (first 12 months) |
| EC2 t3.micro (After Free Tier) | ~£7.50 |
| EBS Storage (8GB) | ~£0.80 |
| Data Transfer | ~£0-2.00 |
| **Total** | **£5-10/month** |

## Scaling

When you outgrow this setup:
- **>10 concurrent users**: Migrate to RDS database
- **>100 requests/minute**: Add Application Load Balancer
- **Multiple regions**: Consider ECS/Fargate deployment

## Security Notes

- This is a cost-optimized deployment suitable for personal/demo use
- For production use, consider:
  - Custom VPC with private subnets
  - RDS instead of local storage
  - WAF and CloudTrail
  - Regular security updates

## Support

For issues or questions:
- Check logs: `sudo docker logs healthdiary`
- Review deployment logs: `sudo cat /var/log/healthdiary-deploy.log`
- GitHub Issues: https://github.com/michaeltlewis/healthdiary/issues