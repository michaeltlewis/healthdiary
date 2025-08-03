terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project = "healthdiary"
    }
  }
}

# Data source for latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

# Default VPC
data "aws_vpc" "default" {
  default = true
}

# Default subnet in first AZ
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security Group for EC2
resource "aws_security_group" "web" {
  name        = "healthdiary-web-sg"
  description = "Security group for Health Diary web server"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Restrict this to your IP for better security
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "healthdiary-web-sg"
  }
}

# Key Pair for SSH access
resource "aws_key_pair" "healthdiary" {
  key_name   = "healthdiary-key"
  public_key = var.ssh_public_key

  tags = {
    Name = "healthdiary-key"
  }
}

# IAM Role for EC2 Instance
resource "aws_iam_role" "healthdiary_ec2_role" {
  name = "healthdiary-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "healthdiary-ec2-role"
  }
}

# IAM Policy for S3 and Transcribe access
resource "aws_iam_policy" "healthdiary_ec2_policy" {
  name = "healthdiary-ec2-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:GetBucketLocation",
          "s3:ListBucket",
          "s3:ListAllMyBuckets"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:PutObjectAcl"
        ]
        Resource = "arn:aws:s3:::healthdiary-*/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetBucketEncryption",
          "s3:PutBucketEncryption",
          "s3:GetBucketVersioning",
          "s3:PutBucketVersioning"
        ]
        Resource = "arn:aws:s3:::healthdiary-*"
      },
      {
        Effect = "Allow"
        Action = [
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob",
          "transcribe:ListTranscriptionJobs"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "healthdiary-ec2-policy"
  }
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "healthdiary_ec2_policy" {
  role       = aws_iam_role.healthdiary_ec2_role.name
  policy_arn = aws_iam_policy.healthdiary_ec2_policy.arn
}

# Instance Profile
resource "aws_iam_instance_profile" "healthdiary_ec2_profile" {
  name = "healthdiary-ec2-profile"
  role = aws_iam_role.healthdiary_ec2_role.name

  tags = {
    Name = "healthdiary-ec2-profile"
  }
}

# User data script to install Docker and run the application
locals {
  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    duckdns_token     = var.duckdns_token
    duckdns_subdomain = var.duckdns_subdomain
  }))
}

# EC2 Instance
resource "aws_instance" "web" {
  ami           = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type
  key_name      = aws_key_pair.healthdiary.key_name

  vpc_security_group_ids = [aws_security_group.web.id]
  subnet_id              = data.aws_subnets.default.ids[0]

  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.healthdiary_ec2_profile.name
  
  user_data = local.user_data

  root_block_device {
    volume_type = "gp3"
    volume_size = 20  # Increased for application data
    encrypted   = true
  }

  tags = {
    Name = "healthdiary-web-server"
  }
}