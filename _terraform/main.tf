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

# VPC Module
module "vpc" {
  source = "../infrastructure/modules/vpc"
  
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
}

# Application Load Balancer Module
module "alb" {
  source = "../infrastructure/modules/alb"
  
  vpc_id         = module.vpc.vpc_id
  public_subnets = module.vpc.public_subnet_ids
}

# ECS Module
module "ecs" {
  source = "../infrastructure/modules/ecs"
  
  vpc_id          = module.vpc.vpc_id
  private_subnets = module.vpc.private_subnet_ids
  alb_target_group_arn = module.alb.target_group_arn
  alb_security_group_id = module.alb.alb_security_group_id
}