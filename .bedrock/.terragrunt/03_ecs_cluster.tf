resource "aws_ecs_cluster" "hashpower_mcp" {
  count    = var.create_core ? 1 : 0
  provider = aws.use1
  name     = "ecs-${local.shortname}-${local.env_suffix}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP ECS Cluster"
    Capability = "ECS"
  })
}

resource "aws_ecs_cluster_capacity_providers" "hashpower_mcp" {
  count              = var.create_core ? 1 : 0
  provider           = aws.use1
  cluster_name       = aws_ecs_cluster.hashpower_mcp[count.index].name
  capacity_providers = ["FARGATE"]
  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}
