terraform {
  # Variables in the backend block need OpenTofu 1.8, and `use_lockfile` 1.10
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
  }

  # State lives in an R2 bucket of its own, created by hand (it can't hold the state of its own creation), through
  # R2's S3 API. Credentials: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, an R2 API token for that bucket only.
  backend "s3" {
    bucket = "leyman-tofu-state"
    key    = "nx-cache/terraform.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://${var.account_id}.r2.cloudflarestorage.com"
    }
    # R2 is not AWS: there is no region, account, or instance metadata to check
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    # Locks with a conditional write next to the state, so two applies never run at once
    use_lockfile = true
  }

  # The state holds the deploy token's value, so it is encrypted before it leaves this machine. Losing the
  # passphrase loses the state (the resources stay, and can be imported again).
  encryption {
    key_provider "pbkdf2" "passphrase" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "passphrase" {
      keys = key_provider.pbkdf2.passphrase
    }
    state {
      method   = method.aes_gcm.passphrase
      enforced = true
    }
    plan {
      method   = method.aes_gcm.passphrase
      enforced = true
    }
  }
}

# Credentials: CLOUDFLARE_API_TOKEN, a token that may manage R2 buckets and account API tokens (see README.md)
provider "cloudflare" {}
