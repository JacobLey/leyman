output "cache_bucket" {
  description = "Bucket the Worker binds as `cache`."
  value       = cloudflare_r2_bucket.cache.name
}

output "deploy_token" {
  description = "Token for CI's `wrangler deploy`: the `CLOUDFLARE_API_TOKEN` secret of the repository's `nx-cache` environment."
  value       = cloudflare_account_token.deploy.value
  sensitive   = true
}
