create_core = true

mcp_service = {
  create   = true
  cnt_port = 8080
  task_cpu = 512
  task_ram = 1024
}

########################################
# Account metadata
########################################
provider_profile  = "titanio-dev"
account_shortname = "titanio-dev"
account_number    = "434960487817"
account_lifecycle = "dev"
default_region    = "us-east-1"
region_shortname  = "use1"

vpc_index            = 1
devops_keypair       = "bedrock-titanio-dev-use1"
titanio_net_edge_vpn = "172.18.16.0/20"
protect_environment  = false

ecs_task_role_arn = "arn:aws:iam::434960487817:role/ecsTaskExecutionRole"

default_tags = {
  ServiceOffering = "Cloud Foundation"
  Department      = "DevOps"
  Environment     = "dev"
  Owner           = "aws-titanio-dev@titan.io"
  Scope           = "Global"
  CostCenter      = null
  Compliance      = null
  Classification  = null
  Repository      = "https://github.com/Lumerin-protocol/hashpower-mcp.git//bedrock/02-dev"
  ManagedBy       = "Terraform"
}

foundation_tags = {
  Name          = null
  Capability    = null
  Application   = "Hashpower MCP - DEV"
  LifecycleDate = null
}
