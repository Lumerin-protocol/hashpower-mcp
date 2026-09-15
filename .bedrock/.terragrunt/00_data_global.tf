################################################################################
# Hashpower.io DNS & ACM lookups (same split as hashpower-io)
#
#   Root zone  hashpower.io              → titanio-net (lmn)
#   Env zone   dev.hashpower.io          → titanio-dev
#   Root ACM   hashpower.io + *.hashpower.io         → titanio-lmn / us-east-1
#   Env ACM    dev.hashpower.io + *.dev.hashpower.io → titanio-dev / us-east-1
################################################################################

data "aws_route53_zone" "hashpower_io_root" {
  count        = local.is_lmn ? 1 : 0
  provider     = aws.titanio-net
  name         = "hashpower.io"
  private_zone = false
}

data "aws_route53_zone" "hashpower_io_env" {
  count        = local.is_lmn ? 0 : 1
  provider     = aws.use1
  name         = "${substr(var.account_shortname, 8, 3)}.hashpower.io"
  private_zone = false
}

data "aws_acm_certificate" "hashpower_io" {
  provider = aws.use1
  domain   = local.is_lmn ? "hashpower.io" : "${substr(var.account_shortname, 8, 3)}.hashpower.io"
  statuses = ["ISSUED"]
}

data "aws_iam_openid_connect_provider" "github" {
  provider = aws.use1
  url      = "https://token.actions.githubusercontent.com"
}
