resource "cloudflare_r2_bucket" "cache" {
  account_id = var.account_id
  name       = var.cache_bucket
}

# The Worker never serves a result past its maximum age, so the bucket deletes it a day later: never before the
# Worker stops serving it, and only once nothing can read it
resource "cloudflare_r2_bucket_lifecycle" "cache" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.cache.name
  rules = [{
    id      = "Delete results the Worker no longer serves"
    enabled = true
    conditions = {
      prefix = ""
    }
    delete_objects_transition = {
      condition = {
        type    = "Age"
        max_age = (var.max_age_days + 1) * 24 * 60 * 60
      }
    }
    abort_multipart_uploads_transition = {
      condition = {
        type    = "Age"
        max_age = 24 * 60 * 60
      }
    }
  }]
}

data "cloudflare_account_api_token_permission_groups_list" "all" {
  account_id = var.account_id
}

locals {
  # A name can appear in several scopes, so each maps to every ID it has
  permission_groups = {
    for group in data.cloudflare_account_api_token_permission_groups_list.all.result : group.name => group.id...
  }
}

# What CI's `wrangler deploy` uses, on pushes to main only: it may change Workers' code, and nothing else. The
# bucket and this token are managed here, by the maintainer
resource "cloudflare_account_token" "deploy" {
  account_id = var.account_id
  name       = "leyman-nx-cache deploy (GitHub Actions)"
  policies = [{
    effect = "allow"
    permission_groups = [
      for name in ["Workers Scripts Write", "Account Settings Read"] : { id = local.permission_groups[name][0] }
    ]
    resources = jsonencode({
      "com.cloudflare.api.account.${var.account_id}" = "*"
    })
  }]
}
