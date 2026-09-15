################################################################################
# PUBLIC MCP SERVICE
#
# Terraform: SGs, internet-facing ALB, HTTPS listener, WAF, Route53, log group,
# ECS service (desired_count=0), stub task definition.
#
# deploy-mcp.yml: image, env (HASHPOWER_ENV / RPC / docs URL), desired_count.
#
# Stateless on purpose — no stickiness, no session affinity. Any task can
# serve any MCP call. Wallet address is a tool parameter, not session state.
#
# DNS:
#   DEV  mcp.dev.hashpower.io   (zone + wildcard cert already in titanio-dev)
#   LMN  mcp.hashpower.io       (zone in titanio-net, cert in titanio-lmn)
################################################################################

resource "aws_security_group" "mcp_alb_use1" {
  count       = var.create_core && var.mcp_service.create ? 1 : 0
  provider    = aws.use1
  name        = "${local.shortname}-alb-${local.env_suffix}"
  description = "Public ALB for Hashpower MCP"
  vpc_id      = data.aws_vpc.use1_1.id

  ingress {
    description = "HTTP (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP ALB Security Group"
    Capability = "MCP"
  })
}

resource "aws_security_group" "mcp_ecs_use1" {
  count       = var.create_core && var.mcp_service.create ? 1 : 0
  provider    = aws.use1
  name        = "${local.shortname}-ecs-${local.env_suffix}"
  description = "ECS tasks for Hashpower MCP"
  vpc_id      = data.aws_vpc.use1_1.id

  ingress {
    description     = "HTTP from ALB"
    from_port       = var.mcp_service.cnt_port
    to_port         = var.mcp_service.cnt_port
    protocol        = "tcp"
    security_groups = [aws_security_group.mcp_alb_use1[count.index].id]
  }

  egress {
    description = "RPC, subgraphs, docs"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP ECS Security Group"
    Capability = "MCP"
  })
}

resource "aws_cloudwatch_log_group" "mcp_use1" {
  count             = var.create_core && var.mcp_service.create ? 1 : 0
  provider          = aws.use1
  name              = "/ecs/${local.shortname}-${local.env_suffix}"
  retention_in_days = 14

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP ECS Log Group"
    Capability = "Logs"
  })
}

resource "aws_alb" "mcp_ext" {
  count                      = var.create_core && var.mcp_service.create ? 1 : 0
  provider                   = aws.use1
  name                       = "alb-${local.shortname}-ext-${local.env_suffix}"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.mcp_alb_use1[count.index].id]
  subnets                    = [for e in data.aws_subnet.edge_use1_1 : e.id]
  enable_deletion_protection = var.protect_environment
  idle_timeout               = 120

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP External ALB"
    Capability = "MCP"
  })
}

resource "aws_alb_target_group" "mcp_ext" {
  count                         = var.create_core && var.mcp_service.create ? 1 : 0
  provider                      = aws.use1
  name                          = "tg-${local.shortname}-${local.env_suffix}"
  port                          = var.mcp_service.cnt_port
  protocol                      = "HTTP"
  vpc_id                        = data.aws_vpc.use1_1.id
  target_type                   = "ip"
  load_balancing_algorithm_type = "round_robin"
  deregistration_delay          = 10

  health_check {
    enabled             = true
    interval            = 30
    path                = "/health"
    port                = var.mcp_service.cnt_port
    protocol            = "HTTP"
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  stickiness {
    type    = "lb_cookie"
    enabled = false
  }

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP Target Group"
    Capability = "MCP"
  })
}

resource "aws_alb_listener" "mcp_ext_80" {
  count             = var.create_core && var.mcp_service.create ? 1 : 0
  provider          = aws.use1
  load_balancer_arn = aws_alb.mcp_ext[count.index].arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = merge(var.default_tags, var.foundation_tags, {
    Name = "Hashpower MCP HTTP redirect"
  })
}

resource "aws_alb_listener" "mcp_ext_443" {
  count             = var.create_core && var.mcp_service.create ? 1 : 0
  provider          = aws.use1
  load_balancer_arn = aws_alb.mcp_ext[count.index].arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-FS-1-2-Res-2020-10"
  certificate_arn   = local.site_acm_cert_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.mcp_ext[count.index].arn
  }

  tags = merge(var.default_tags, var.foundation_tags, {
    Name = "Hashpower MCP HTTPS"
  })
}

resource "aws_wafv2_web_acl_association" "mcp" {
  count        = var.create_core && var.mcp_service.create ? 1 : 0
  provider     = aws.use1
  resource_arn = aws_alb.mcp_ext[count.index].arn
  web_acl_arn  = data.aws_wafv2_web_acl.bedrock_waf_use1_1.arn
}

resource "aws_route53_record" "mcp_lmn" {
  count    = var.create_core && var.mcp_service.create && local.is_lmn ? 1 : 0
  provider = aws.titanio-net
  zone_id  = local.site_apex_zone_id
  name     = local.mcp_fqdn
  type     = "A"
  alias {
    name                   = aws_alb.mcp_ext[0].dns_name
    zone_id                = aws_alb.mcp_ext[0].zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "mcp_env" {
  count    = var.create_core && var.mcp_service.create && !local.is_lmn ? 1 : 0
  provider = aws.use1
  zone_id  = local.site_apex_zone_id
  name     = local.mcp_fqdn
  type     = "A"
  alias {
    name                   = aws_alb.mcp_ext[0].dns_name
    zone_id                = aws_alb.mcp_ext[0].zone_id
    evaluate_target_health = true
  }
}

resource "aws_ecs_service" "mcp_use1" {
  lifecycle { ignore_changes = [task_definition, desired_count] }
  count                  = var.create_core && var.mcp_service.create ? 1 : 0
  provider               = aws.use1
  name                   = "svc-${local.shortname}-${local.env_suffix}"
  cluster                = aws_ecs_cluster.hashpower_mcp[0].id
  task_definition        = aws_ecs_task_definition.mcp_use1[count.index].arn
  desired_count          = 0
  launch_type            = "FARGATE"
  propagate_tags         = "SERVICE"
  enable_execute_command = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = [for m in data.aws_subnet.middle_use1_1 : m.id]
    assign_public_ip = false
    security_groups  = [aws_security_group.mcp_ecs_use1[count.index].id]
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.mcp_ext[count.index].arn
    container_name   = "${local.shortname}-container"
    container_port   = var.mcp_service.cnt_port
  }

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP Service"
    Capability = "MCP"
  })
}

resource "aws_ecs_task_definition" "mcp_use1" {
  lifecycle { ignore_changes = [container_definitions] }
  count                    = var.create_core && var.mcp_service.create ? 1 : 0
  provider                 = aws.use1
  family                   = "tsk-${local.shortname}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.mcp_service.task_cpu
  memory                   = var.mcp_service.task_ram
  task_role_arn            = local.titanio_role_arn
  execution_role_arn       = local.titanio_role_arn

  container_definitions = jsonencode([
    {
      name      = "${local.shortname}-container"
      image     = "public.ecr.aws/docker/library/busybox:latest"
      command   = ["sh", "-c", "echo 'hashpower-mcp stub - awaiting CI/CD deploy'; sleep infinity"]
      cpu       = 0
      essential = true
      portMappings = [
        {
          containerPort = var.mcp_service.cnt_port
          hostPort      = var.mcp_service.cnt_port
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-create-group"  = "true"
          "awslogs-group"         = aws_cloudwatch_log_group.mcp_use1[0].name
          "awslogs-region"        = var.default_region
          "awslogs-stream-prefix" = "${local.shortname}-tsk"
        }
      }
    }
  ])

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP Task Definition"
    Capability = "MCP"
  })
}
