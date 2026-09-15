locals {
  shortname = "hashpower-mcp"

  # Name-only form (older repos). New repos default to immutable subjects
  # (`org@id/repo@id`) — see github_org_repo_oidc. Trust both so toggling
  # GitHub's "use_immutable_subject" does not break AssumeRoleWithWebIdentity.
  github_org_repo = "Lumerin-protocol/hashpower-mcp"

  # From GET /repos/Lumerin-protocol/hashpower-mcp/actions/oidc/customization/sub
  #   use_immutable_subject=true
  #   sub_claim_prefix=repo:Lumerin-protocol@92322520/hashpower-mcp@1370174274
  github_org_repo_oidc = "Lumerin-protocol@92322520/hashpower-mcp@1370174274"

  github_org_repo_trust = [
    local.github_org_repo_oidc,
    local.github_org_repo,
  ]

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
