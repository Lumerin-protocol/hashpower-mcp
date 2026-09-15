################################################################################
# VERSIONS
################################################################################
terraform {
  required_version = ">= 1.2.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.43.0"
    }
  }
}

provider "aws" {
  region  = "us-east-1"
  profile = var.provider_profile
  ignore_tags {
    key_prefixes = ["kubernetes.io/"]
  }
}

# titanio-net (owner of root zone hashpower.io) — used by lmn DNS
provider "aws" {
  alias   = "titanio-net"
  region  = "us-east-1"
  profile = "titanio-net"
  ignore_tags {
    key_prefixes = ["kubernetes.io/"]
  }
}

provider "aws" {
  alias   = "use1"
  region  = "us-east-1"
  profile = var.provider_profile
  ignore_tags {
    key_prefixes = ["kubernetes.io/"]
  }
}
