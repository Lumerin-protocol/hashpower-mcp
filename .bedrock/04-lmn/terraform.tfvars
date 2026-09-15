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
provider_profile  = "titanio-lmn"
account_shortname = "titanio-lmn"
account_number    = "330280307271"
account_lifecycle = "lmn"
default_region    = "us-east-1"
region_shortname  = "use1"

vpc_index            = 1
devops_keypair       = "bedrock-titanio-lmn-use1"
titanio_net_edge_vpn = "172.18.16.0/20"
protect_environment  = true

ecs_task_role_arn = "arn:aws:iam::330280307271:role/ecsTaskExecutionRole"

default_tags = {
  ServiceOffering = "Cloud Foundation"
  Department      = "DevOps"
  Environment     = "production"
  Owner           = "aws-titanio-lmn@titan.io"
  Scope           = "Global"
  CostCenter      = null
  Compliance      = null
  Classification  = null
  Repository      = "https://github.com/Lumerin-protocol/hashpower-mcp.git//bedrock/04-lmn"
  ManagedBy       = "Terraform"
}

foundation_tags = {
  Name          = null
  Capability    = null
  Application   = "Hashpower MCP - PRODUCTION"
  LifecycleDate = null
}
