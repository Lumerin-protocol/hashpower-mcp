################################################################################
# HASHPOWER MCP
# /health returns 200 and describes this environment. Component alarms do not notify.
################################################################################

locals {
  hashpower_mcp_namespace     = "HashpowerMcp/${local.env_suffix}"
  hashpower_mcp_monitor_name  = "hashpower-mcp-monitor-${local.env_suffix}"
  hashpower_mcp_health_url    = "https://${local.mcp_fqdn}/health"
  hashpower_mcp_expected_env  = local.is_lmn ? "mainnet" : "testnet"
  hashpower_mcp_expected_net  = local.is_lmn ? "base" : "base-sepolia"
  hashpower_mcp_expected_name = local.is_lmn ? "hashpower" : "dev-hashpower"
  hashpower_mcp_alerts_topic  = var.account_lifecycle == "dev" ? "titanio-dev-dev-alerts" : "titanio-lmn-devops-alerts"
  hashpower_mcp_eval_periods  = 3
  hashpower_mcp_check_seconds = 300
}

data "aws_sns_topic" "hashpower_mcp_alerts" {
  count = var.create_core && var.mcp_service.create ? 1 : 0
  name  = local.hashpower_mcp_alerts_topic
}

data "archive_file" "hashpower_mcp_monitor" {
  count       = var.create_core && var.mcp_service.create ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/05_health_monitor.py"
  output_path = "${path.module}/hashpower_mcp_monitor_${filemd5("${path.module}/05_health_monitor.py")}.zip"
}

resource "aws_iam_role" "hashpower_mcp_monitor" {
  count    = var.create_core && var.mcp_service.create ? 1 : 0
  provider = aws.use1
  name     = local.hashpower_mcp_monitor_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP Monitor"
    Capability = "Monitoring"
  })
}

resource "aws_iam_role_policy" "hashpower_mcp_monitor" {
  count    = var.create_core && var.mcp_service.create ? 1 : 0
  provider = aws.use1
  name     = "hashpower-mcp-monitor"
  role     = aws_iam_role.hashpower_mcp_monitor[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.default_region}:${var.account_number}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "hashpower_mcp_monitor" {
  count         = var.create_core && var.mcp_service.create ? 1 : 0
  provider      = aws.use1
  function_name = local.hashpower_mcp_monitor_name
  description   = "Checks mcp /health status and payload"
  role          = aws_iam_role.hashpower_mcp_monitor[0].arn
  handler       = "05_health_monitor.lambda_handler"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.hashpower_mcp_monitor[0].output_path
  source_code_hash = data.archive_file.hashpower_mcp_monitor[0].output_base64sha256

  environment {
    variables = {
      HEALTH_URL       = local.hashpower_mcp_health_url
      EXPECTED_ENV     = local.hashpower_mcp_expected_env
      EXPECTED_NETWORK = local.hashpower_mcp_expected_net
      EXPECTED_NAME    = local.hashpower_mcp_expected_name
      CW_NAMESPACE     = local.hashpower_mcp_namespace
      ENVIRONMENT      = local.env_suffix
    }
  }

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP Monitor"
    Capability = "Monitoring"
  })
}

resource "aws_cloudwatch_event_rule" "hashpower_mcp_monitor" {
  count               = var.create_core && var.mcp_service.create ? 1 : 0
  provider            = aws.use1
  name                = "${local.hashpower_mcp_monitor_name}-schedule"
  schedule_expression = "rate(5 minutes)"
}

resource "aws_cloudwatch_event_target" "hashpower_mcp_monitor" {
  count     = var.create_core && var.mcp_service.create ? 1 : 0
  provider  = aws.use1
  rule      = aws_cloudwatch_event_rule.hashpower_mcp_monitor[0].name
  target_id = "hashpower-mcp-monitor"
  arn       = aws_lambda_function.hashpower_mcp_monitor[0].arn
}

resource "aws_lambda_permission" "hashpower_mcp_monitor" {
  count         = var.create_core && var.mcp_service.create ? 1 : 0
  provider      = aws.use1
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.hashpower_mcp_monitor[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.hashpower_mcp_monitor[0].arn
}

resource "aws_cloudwatch_metric_alarm" "hashpower_mcp_down" {
  count               = var.create_core && var.mcp_service.create ? 1 : 0
  provider            = aws.use1
  alarm_name          = "hashpower-mcp-down-${local.env_suffix}"
  alarm_description   = "mcp /health did not return 200"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = local.hashpower_mcp_eval_periods
  metric_name         = "health_up"
  namespace           = local.hashpower_mcp_namespace
  period              = local.hashpower_mcp_check_seconds
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"
  dimensions          = { Environment = local.env_suffix }
  alarm_actions       = []
  ok_actions          = []
}

resource "aws_cloudwatch_metric_alarm" "hashpower_mcp_payload" {
  count               = var.create_core && var.mcp_service.create ? 1 : 0
  provider            = aws.use1
  alarm_name          = "hashpower-mcp-payload-${local.env_suffix}"
  alarm_description   = "mcp /health payload does not match this environment"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = local.hashpower_mcp_eval_periods
  metric_name         = "health_payload_ok"
  namespace           = local.hashpower_mcp_namespace
  period              = local.hashpower_mcp_check_seconds
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"
  dimensions          = { Environment = local.env_suffix }
  alarm_actions       = []
  ok_actions          = []
}

resource "aws_cloudwatch_composite_alarm" "hashpower_mcp_unhealthy" {
  count             = var.create_core && var.mcp_service.create ? 1 : 0
  provider          = aws.use1
  alarm_name        = "hashpower-mcp-${local.env_suffix}"
  alarm_description = "MCP is down or /health does not describe this environment"

  alarm_rule = join(" OR ", [
    "ALARM(${aws_cloudwatch_metric_alarm.hashpower_mcp_down[0].alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.hashpower_mcp_payload[0].alarm_name})",
  ])

  alarm_actions = [data.aws_sns_topic.hashpower_mcp_alerts[0].arn]
  ok_actions    = [data.aws_sns_topic.hashpower_mcp_alerts[0].arn]

  tags = merge(var.default_tags, var.foundation_tags, {
    Name       = "Hashpower MCP Unhealthy"
    Capability = "Monitoring"
  })
}
