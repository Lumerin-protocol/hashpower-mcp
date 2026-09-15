data "aws_vpc" "use1_1" {
  provider = aws.use1
  tags = {
    Name = "vpc-${var.region_shortname}-${var.vpc_index}-${var.account_shortname}"
  }
}

data "aws_subnet" "edge_use1_1" {
  provider = aws.use1
  count    = 3
  filter {
    name   = "tag:Name"
    values = ["sn-use1-1-${var.account_shortname}-edge-${count.index + 1}"]
  }
}

data "aws_subnet" "middle_use1_1" {
  provider = aws.use1
  count    = 3
  filter {
    name   = "tag:Name"
    values = ["sn-use1-1-${var.account_shortname}-middle-${count.index + 1}"]
  }
}

data "aws_wafv2_web_acl" "bedrock_waf_use1_1" {
  provider = aws.use1
  name     = "waf-bedrock-use1-1"
  scope    = "REGIONAL"
}
