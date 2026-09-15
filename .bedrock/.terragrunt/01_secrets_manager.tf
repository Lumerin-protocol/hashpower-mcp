resource "aws_secretsmanager_secret" "hashpower_mcp" {
  count       = var.create_core ? 1 : 0
  provider    = aws.use1
  name        = "${local.shortname}-secrets-v1-${local.env_suffix}"
  description = "Deployment configuration for the Hashpower MCP service"
  tags = merge(var.default_tags, var.foundation_tags, {
    Name = "${local.shortname}-secrets-v1"
  })
}

resource "aws_secretsmanager_secret_version" "hashpower_mcp" {
  count     = var.create_core ? 1 : 0
  provider  = aws.use1
  secret_id = aws_secretsmanager_secret.hashpower_mcp[0].id
  secret_string = jsonencode({
    deployment = {
      aws_region     = var.default_region
      environment    = var.account_lifecycle
      ecs_cluster    = var.create_core ? aws_ecs_cluster.hashpower_mcp[0].name : ""
      ecs_service    = var.create_core && var.mcp_service.create ? aws_ecs_service.mcp_use1[0].name : ""
      task_family    = "tsk-${local.shortname}"
      mcp_url        = "https://${local.mcp_fqdn}/mcp"
      mcp_health_url = "https://${local.mcp_fqdn}/health"
    }
  })
}
