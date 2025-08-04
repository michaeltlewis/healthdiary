#!/bin/bash

set -e

echo "Health Diary Simple AWS Deployment Script"
echo "========================================"
echo "This will deploy a single EC2 instance (~$5-10/month)"
echo "Optional: SSL certificate support with Duck DNS"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "Error: AWS CLI not configured or no valid credentials"
    exit 1
fi

echo "✓ AWS credentials verified"

# Check if SSH key is provided
if [ -z "$SSH_PUBLIC_KEY" ]; then
    echo ""
    echo "⚠️  SSH_PUBLIC_KEY environment variable not set"
    echo "To set it, run:"
    echo "export SSH_PUBLIC_KEY=\"$(cat ~/.ssh/id_rsa.pub)\""
    echo ""
    echo "Or generate a new key pair:"
    echo "ssh-keygen -t rsa -b 2048 -f ~/.ssh/healthdiary_key"
    echo "export SSH_PUBLIC_KEY=\"$(cat ~/.ssh/healthdiary_key.pub)\""
    echo ""
    read -p "Continue without SSH key? You won't be able to SSH to the instance (y/N): " -r
    if [[ ! "$REPLY" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        exit 1
    fi
    SSH_KEY_VAR=""
else
    SSH_KEY_VAR="-var ssh_public_key=\"$SSH_PUBLIC_KEY\""
    echo "✓ SSH public key found"
fi

# Auto-load .env file if it exists
if [ -f "../.env" ]; then
    echo "✓ Loading environment variables from .env file"
    source ../.env
fi

# Check for Duck DNS configuration (optional)
DUCKDNS_VARS=""
if [ -n "$DUCKDNS_TOKEN" ] && [ -n "$DUCKDNS_SUBDOMAIN" ]; then
    DUCKDNS_VARS="-var duckdns_token=\"$DUCKDNS_TOKEN\" -var duckdns_subdomain=\"$DUCKDNS_SUBDOMAIN\""
    echo "✓ Duck DNS configuration found - SSL certificate will be generated"
    echo "  Domain: $DUCKDNS_SUBDOMAIN.duckdns.org"
else
    echo "ℹ️  Duck DNS not configured - deploying with HTTP only"
    echo "  To enable SSL, set DUCKDNS_TOKEN and DUCKDNS_SUBDOMAIN environment variables"
fi

# Initialize Terraform
echo "Initializing Terraform..."
terraform init

# Validate Terraform configuration
echo "Validating Terraform configuration..."
terraform validate

# Plan the deployment
echo "Planning deployment..."
TERRAFORM_VARS="$SSH_KEY_VAR $DUCKDNS_VARS"
if [ -n "$TERRAFORM_VARS" ]; then
    eval "terraform plan $TERRAFORM_VARS -out=tfplan"
else
    terraform plan -out=tfplan
fi

# Show cost estimate
echo ""
echo "💰 Estimated monthly cost: ~$5-10 (t3.micro in free tier = $0 first year)"
echo "📊 vs. previous complex setup: ~$90-180/month savings!"
echo ""

# Ask for confirmation
echo "Review the plan above. Do you want to apply these changes? (y/N)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Applying Terraform configuration..."
    terraform apply tfplan
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "Access your application at:"
    terraform output website_url
    echo ""
    echo "SSH access (if key provided):"
    echo "ssh -i ~/.ssh/healthdiary_key ec2-user@$(terraform output -raw instance_public_ip)"
    echo ""
    echo "The application may take 2-3 minutes to fully start up."
else
    echo "Deployment cancelled."
    rm -f tfplan
fi