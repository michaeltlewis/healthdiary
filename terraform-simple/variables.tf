variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-west-2"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"  # Free tier eligible
}

variable "ssh_public_key" {
  description = "SSH public key for EC2 access"
  type        = string
  default     = ""  # You'll need to provide this
}

variable "duckdns_token" {
  description = "Duck DNS token for SSL certificate setup (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "duckdns_subdomain" {
  description = "Duck DNS subdomain (without .duckdns.org) for SSL certificate (optional)"
  type        = string
  default     = ""
}