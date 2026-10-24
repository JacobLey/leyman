# @leyman/nx-cache-tofu

OpenTofu configuration of the hosted Nx cache's Cloudflare resources: the R2 bucket of results, its lifecycle rule (results are deleted a day after the Worker stops serving them), and the account token CI deploys the Worker with, which may only deploy Workers. See [`../README.md`](../README.md) for why, and for setting it up.

State is in a separate R2 bucket made by hand, through R2's S3 API, encrypted before it leaves your machine (OpenTofu's state encryption): it holds the deploy token. Nx runs `tofu-fmt` and `tofu-validate` here, which need no credentials. `tofu plan` and `tofu apply` are only ever run by hand.

| File | What |
|---|---|
| `versions.tf` | OpenTofu and provider versions, the state backend and its encryption |
| `variables.tf` | The account ID, the state's passphrase, and the bucket's name and maximum age (in sync with `../worker/wrangler.jsonc`) |
| `main.tf` | The bucket, its lifecycle rule, and the deploy token |
| `outputs.tf` | The bucket's name, and the deploy token |
| `.terraform.lock.hcl` | The provider's exact version and hashes, for every platform `tofu` runs on. Update it with `tofu providers lock -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_arm64 -platform=darwin_amd64` |
