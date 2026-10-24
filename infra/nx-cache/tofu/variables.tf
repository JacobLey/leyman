variable "account_id" {
  description = "Cloudflare account ID, from the dashboard's account home. Not a secret, but the account's own."
  type        = string
}

variable "state_passphrase" {
  description = "Passphrase the state is encrypted with: at least 16 characters, kept in a password manager."
  type        = string
  sensitive   = true
}

variable "cache_bucket" {
  description = "R2 bucket of cached Nx task results. Keep in sync with `bucket_name` in `../worker/wrangler.jsonc`."
  type        = string
  default     = "leyman-nx-cache"
}

variable "max_age_days" {
  description = "Days the Worker serves a result for. Keep in sync with `maxAgeDays` in `../worker/wrangler.jsonc`."
  type        = number
  default     = 7
}
