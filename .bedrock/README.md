# Hashpower MCP infrastructure

Terragrunt for the hosted Streamable HTTP server. Same account/branch map as hashpower-io:

| Dir | Account | Branch | Hostname | `HASHPOWER_ENV` |
| --- | --- | --- | --- | --- |
| `02-dev` | titanio-dev | `dev` | `mcp.dev.hashpower.io` | testnet |
| `04-lmn` | titanio-lmn | `main` | `mcp.hashpower.io` | mainnet |

DNS and ACM already exist (foundation-extra): `*.dev.hashpower.io` in titanio-dev, `*.hashpower.io` in titanio-lmn.

Terraform builds the shell (cluster, public ALB, WAF, Route53, stub task at `desired_count=0`). `.github/workflows/deploy-mcp.yml` ships the image and scales the service.

## Apply DEV

```bash
cd .bedrock/02-dev
terragrunt init
terragrunt plan
terragrunt apply
```

Then:

1. Copy `terragrunt output -raw github_actions_role_arn` into repo secret `AWS_ROLE_ARN_DEV`.
2. GitHub Environment `dev`: optional `HASHPOWER_RPC_URL` secret (else public Base Sepolia RPC); vars `HASHPOWER_ENV=testnet`, `HASHPOWER_DOCS_URL=https://dev.hashpower.io`.
3. GitHub Environment `npm-publish`: add this repo + `.github/workflows/publish-mcp.yml` as a Trusted Publisher on npmjs.com for `@hashpower/mcp`.
4. Make the GHCR package public (`ghcr.io/lumerin-protocol/hashpower-mcp`) so Fargate can pull it.
5. Re-run **Deploy hashpower-mcp** on `dev`.

Do **not** apply `04-lmn` until promoting `main`. The module is already wired so that apply is the production cutover, not a rewrite.
