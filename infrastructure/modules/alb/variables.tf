variable "vpc_id" {
  description = "VPC ID where ALB will be created"
  type        = string
}

variable "public_subnets" {
  description = "List of public subnet IDs for ALB"
  type        = list(string)
}