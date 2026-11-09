# @leyman/nx-cache-tofu

OpenTofu configuration for the hosted Nx cache's Cloudflare R2 bucket, its lifecycle rule, and the token CI deploys with.

The lifecycle rule deletes results a day after the Worker stops serving them, and the token may only deploy Workers. See [`../README.md`](../README.md) for why it is built this way, and for setting it up.

The state is kept in a separate R2 bucket, made by hand and reached through R2's S3 API. Since the state holds the deploy token, OpenTofu's state encryption encrypts it before it leaves your machine. Nx runs `tofu-fmt` and `tofu-validate` here, which need no credentials, and `tofu plan` and `tofu apply` are only ever run by hand.

Before running `tofu`, source [`env.sh`](env.sh) (`. ./env.sh`). It asks for the Cloudflare token and the passphrase (and the account ID, unless it is already set), and sets the variables `tofu` reads, including the state bucket's S3 credentials, which it derives from the token.

| File                  | What                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.sh`              | Sets `TF_VAR_account_id`, `TF_VAR_state_passphrase`, `CLOUDFLARE_API_TOKEN`, and `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` derived from the token                                                        |
| `versions.tf`         | OpenTofu and provider versions, the state backend and its encryption                                                                                                                                       |
| `variables.tf`        | The account ID, the state's passphrase, and the bucket's name and maximum age (in sync with `../worker/wrangler.jsonc`)                                                                                    |
| `main.tf`             | The bucket, its lifecycle rule, and the deploy token                                                                                                                                                       |
| `outputs.tf`          | The bucket's name, and the deploy token                                                                                                                                                                    |
| `.terraform.lock.hcl` | The provider's exact version and hashes, for every platform `tofu` runs on. Update it with `tofu providers lock -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_arm64 -platform=darwin_amd64` |
