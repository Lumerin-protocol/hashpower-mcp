variable "create_core" {
  description = "Create IAM, ECS cluster, and MCP service"
  type        = bool
  default     = false
}

variable "mcp_service" {
  description = "Public Streamable HTTP MCP Fargate service"
  type = object({
    create   = bool
    cnt_port = number
    task_cpu = number
    task_ram = number
  })
  default = {
    create   = true
    cnt_port = 8080
    task_cpu = 512
    task_ram = 1024
  }
}

variable "ecs_task_role_arn" {
  description = "Additional IAM role ARN GitHub Actions may PassRole to ECS (ecsTaskExecutionRole)"
  type        = string
}

variable "account_shortname" { description = "e.g. titanio-dev, titanio-lmn" }
variable "account_lifecycle" {
  description = "sbx | dev | stg | lmn"
  type        = string
}
variable "account_number" {}
variable "default_region" {}
variable "region_shortname" {
  default = "use1"
}
variable "vpc_index" {}
variable "devops_keypair" {}
variable "titanio_net_edge_vpn" {}
variable "protect_environment" {}
variable "default_tags" {
  type = map(string)
}
variable "foundation_tags" {
  type = map(string)
}
variable "provider_profile" {
  description = "AWS profile for the local account"
}
