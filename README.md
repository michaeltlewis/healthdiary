# Health Diary AWS Infrastructure

A containerized web application deployed on AWS using Terraform, featuring a simple health diary interface running on ECS Fargate.

## Architecture

- **VPC**: Custom VPC with public and private subnets across 2 AZs
- **ECS**: Fargate cluster running containerized web application
- **ALB**: Application Load Balancer for traffic distribution
- **Security**: Security groups with least-privilege access
- **Monitoring**: CloudWatch logging enabled

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.0 installed
- Appropriate AWS permissions for creating VPC, ECS, ALB, and IAM resources

## Deployment

1. **Initialize and Deploy**:
   ```bash
   ./deploy.sh
   ```

2. **Manual Deployment** (alternative):
   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply
   ```

## Infrastructure Components

### Networking
- VPC (10.0.0.0/16)
- 2 Public subnets (10.0.1.0/24, 10.0.2.0/24)
- 2 Private subnets (10.0.3.0/24, 10.0.4.0/24)
- Internet Gateway and NAT Gateways

### Compute
- ECS Fargate cluster
- Single task running nginx container
- Auto-scaling enabled
- Container health checks

### Load Balancing
- Application Load Balancer
- Target group with health checks
- HTTP listener (port 80)

### Security
- Security groups with minimal required access
- ALB accepts traffic from internet (ports 80/443)
- ECS tasks only accept traffic from ALB

### Logging
- CloudWatch log group for application logs
- 7-day log retention

## Resource Tags

All resources are tagged with:
- `Project = "healthdiary"`

## Cleanup

To destroy the infrastructure:

```bash
cd terraform
terraform destroy
```

## Current Status

This deployment provides the foundational infrastructure for the Health Diary application. The current container serves a simple HTML page demonstrating successful deployment.

## Next Steps

1. Replace the simple HTML container with the actual Health Diary application
2. Add HTTPS/SSL certificates
3. Implement database services (RDS)
4. Add S3 buckets for file storage
5. Integrate AI/ML services for health analysis
6. Implement user authentication and authorization