locals {
  shortname = "hashpower-mcp"

  github_org_repo = "Lumerin-protocol/hashpower-mcp"

  github_oidc_sub_claims = var.account_lifecycle == "dev" ? [
    "ref:refs/heads/dev",
    "ref:refs/heads/cicd/*",
    "environment:dev",
    ] : (
    [
      "ref:refs/heads/main",
      "environment:main",
    ]
  )

  is_lmn = var.account_lifecycle == "lmn"

  _site_zone        = concat(data.aws_route53_zone.hashpower_io_root, data.aws_route53_zone.hashpower_io_env)
  site_apex         = local._site_zone[0].name
  site_apex_zone_id = local._site_zone[0].zone_id
  site_acm_cert_arn = data.aws_acm_certificate.hashpower_io.arn

  # DEV:  mcp.dev.hashpower.io
  # LMN:  mcp.hashpower.io
  mcp_fqdn = "mcp.${local.site_apex}"

  titanio_role_arn = "arn:aws:iam::${var.account_number}:role/system/bedrock-foundation-role"
  env_suffix       = substr(var.account_shortname, 8, 3)
}
