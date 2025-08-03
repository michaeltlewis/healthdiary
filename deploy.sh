#!/bin/bash

set -e

echo "Health Diary AWS Deployment Script"
echo "=================================="

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "Error: AWS CLI not configured or no valid credentials"
    exit 1
fi

echo "✓ AWS credentials verified"

# Initialize Terraform
echo "Initializing Terraform..."
cd terraform
terraform init

# Validate Terraform configuration
echo "Validating Terraform configuration..."
terraform validate

# Plan the deployment
echo "Planning deployment..."
terraform plan -out=tfplan

# Ask for confirmation
echo ""
echo "Review the plan above. Do you want to apply these changes? (y/N)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Applying Terraform configuration..."
    terraform apply tfplan
    
    echo ""
    echo "Deployment completed successfully!"
    echo "Access your application at:"
    terraform output alb_dns_name
else
    echo "Deployment cancelled."
    rm -f tfplan
fi