variable "vpc_id" {
  description = "VPC ID where ECS will be created"
  type        = string
}

variable "private_subnets" {
  description = "List of private subnet IDs for ECS service"
  type        = list(string)
}

variable "alb_target_group_arn" {
  description = "ARN of the ALB target group"
  type        = string
}

variable "alb_security_group_id" {
  description = "Security group ID of the ALB"
  type        = string
}