output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions (repo secret AWS_ROLE_ARN_DEV / AWS_ROLE_ARN_LMN)"
  value       = var.create_core ? aws_iam_role.github_actions_hashpower_mcp[0].arn : null
}

output "mcp_url" {
  description = "Public Streamable HTTP endpoint"
  value       = var.create_core && var.mcp_service.create ? "https://${local.mcp_fqdn}/mcp" : null
}

output "mcp_health_url" {
  description = "ALB health check URL"
  value       = var.create_core && var.mcp_service.create ? "https://${local.mcp_fqdn}/health" : null
}

output "ecs_cluster_name" {
  value = var.create_core ? aws_ecs_cluster.hashpower_mcp[0].name : null
}

output "ecs_service_name" {
  value = var.create_core && var.mcp_service.create ? aws_ecs_service.mcp_use1[0].name : null
}

output "site_apex" {
  value = local.site_apex
}

output "mcp_fqdn" {
  value = local.mcp_fqdn
}
