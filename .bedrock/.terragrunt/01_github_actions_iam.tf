################################################################################
# GitHub Actions OIDC role — register task defs + update the MCP ECS service
################################################################################

resource "aws_iam_role" "github_actions_hashpower_mcp" {
  count    = var.create_core ? 1 : 0
  provider = aws.use1
  name     = "github-actions-${local.shortname}-v1-${local.env_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = flatten([
              for repo in local.github_org_repo_trust : [
                for sub_claim in local.github_oidc_sub_claims :
                "repo:${repo}:${sub_claim}"
              ]
            ])
          }
        }
      }
    ]
  })

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "GitHub Actions - Hashpower MCP"
    Capability = "CI/CD"
  })
}

resource "aws_iam_role_policy" "github_ecs_update_mcp" {
  count    = var.create_core && var.mcp_service.create ? 1 : 0
  provider = aws.use1
  name     = "ecs-update-${local.shortname}"
  role     = aws_iam_role.github_actions_hashpower_mcp[count.index].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "UpdateMcpECSService"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = [
          aws_ecs_service.mcp_use1[count.index].id
        ]
      },
      {
        Sid    = "TaskDefinitionOperations"
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition"
        ]
        Resource = "*"
      },
      {
        Sid    = "PassRoleToECS"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          var.ecs_task_role_arn,
          local.titanio_role_arn
        ]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      },
      {
        Sid    = "ReadECSCluster"
        Effect = "Allow"
        Action = [
          "ecs:ListServices",
          "ecs:DescribeClusters"
        ]
        Resource = "*"
      },
      {
        Sid    = "ReadDeploySecret"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [aws_secretsmanager_secret.hashpower_mcp[count.index].arn]
      }
    ]
  })
}
