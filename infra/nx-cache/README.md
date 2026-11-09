# Hosted Nx remote cache

This is one Nx cache shared by CI and every devcontainer, hosted on Cloudflare. Anyone can read from it, and only CI on `main` can write to it. It is also this repository's worked example of a cloud deployment, using wrangler and OpenTofu.

The [Hosted Nx cache](https://jacobley.github.io/leyman/infrastructure/nx-cache/) page on the docs site writes it up for readers. This README is the maintainer's runbook.

| Part | What | Run by |
|---|---|---|
| [`worker/`](worker/) | The cache: a Worker on R2 implementing Nx's self-hosted cache API | CI deploys it with **wrangler** on pushes to `main` |
| [`tofu/`](tofu/) | The R2 bucket, its lifecycle rule, and the token CI deploys with | The maintainer, with **OpenTofu**, by hand |
| [`.devcontainer/nx-cache-server.mjs`](../../.devcontainer/nx-cache-server.mjs) | The cache server Nx talks to, in each devcontainer and on CI's runner, as a tier in front of the Worker | Everyone |

```
devcontainer: Nx ──> nx-cache sidecar ──read──> Worker ──> R2
CI (PR):      Nx ──> runner's cache server ──read──> Worker
CI (main):    Nx ──> runner's cache server ──read/write (GitHub OIDC)──> Worker
```

## Why it is built this way

Only CI on `main` (a push or a scheduled run) can write, using a GitHub OIDC token that the Worker checks itself. That way no pull request, from a fork or not, can write a result that `main` then trusts. That attack is cache poisoning, such as CVE-2025-36852 against bucket-backed Nx caches. There is also no long-lived write secret to leak, because the token is minted per job and lasts minutes, and the cache server requests a new one as it expires.

Reads are public, since results are built from this public repository and hold nothing that isn't already public.

Results that are still in use get refreshed. Nx never uploads a result it read, and R2's lifecycle counts from the upload, so on `main` the cache server uploads a result it serves again once it is 5 days old. The age is set twice and the two must stay equal: `NX_CACHE_REFRESH_AFTER_DAYS` in `ci.yml` and `refreshAfterDays` in `worker/wrangler.jsonc`. The upload happens in the background after the result is served, so Nx never waits, and CI's `Stop Nx cache server` step waits for those uploads to finish. A result that `main` keeps reading never expires, and one it stops reading does. CI's `test` also runs nightly on `main` and writes like a push, so results in use are read and refreshed even in a week without pushes. Refreshing at 5 days out of 7 leaves two nights to refresh a result.

Nx never talks to the Worker directly. The cache server that was already there reads through to it and, on `main`, writes through. Because of that, Dagger's wiring didn't change and credentials never enter Dagger. If the hosted cache is down, a run is only slower.

The maintainer runs OpenTofu by hand, and CI runs wrangler. OpenTofu owns what is set up once and holds credentials. A public repository's pull requests must never get Cloudflare credentials, so CI only runs `tofu fmt` and `tofu validate`, which need none. wrangler owns the Worker's code, which changes with the repository, so CI deploys it from an environment only `main` can use, with a token that may only deploy Workers. wrangler's Miniflare also runs the Worker locally for its tests.

OpenTofu is used instead of Terraform because its state encryption keeps the deploy token unreadable in the state bucket, and its backend block can use variables (for the account ID).

All of it fits in the free tiers. R2 gives 10 GB, 1M writes and 10M reads a month, and Workers give 100k requests a day. A cold CI run makes about 1.4k reads and 1.4k writes, and results expire after 7 days. Keep the account on the Workers free plan, because its daily limit stops requests rather than billing them. Since the bucket is reachable only through the Worker, a flood of public reads can at worst make the cache unavailable until the limit resets, and it can't cost anything. On Workers Paid, both would be billed per request, with no cap.

## Setting it up

Done once, by the maintainer. You need a Cloudflare account with R2 enabled (R2 asks for a payment method even on the free tier) and a `workers.dev` subdomain (the dashboard's Workers page offers one on first visit). Then, in the devcontainer, which has `tofu` (rebuild it if `tofu version` isn't found):

1. **Find your account ID**: the 32 hex characters after `dash.cloudflare.com/` in any dashboard URL (also on the account's home page).
2. **Make the state bucket by hand**: R2 → *Create bucket*, named `leyman-tofu-state`. It can't be managed by OpenTofu, as it holds the state of everything OpenTofu creates.
3. **Make a token for OpenTofu**: My Profile → *API Tokens* → *Create Token* → *Custom token*, for your account: *Workers R2 Storage: Edit* and *Account API Tokens: Edit*. It creates the cache bucket and the deploy token, and since R2's S3 credentials are derived from it, it reaches the state bucket too.
4. **Choose a passphrase** for the state's encryption, at least 16 characters. Keep it, and the token, in a password manager. The passphrase is the one secret that can't be replaced: without it the state can't be read (the resources stay, and could be imported again). The token can be remade at any time, or created with an expiry for each apply.
5. **Apply**, from `infra/nx-cache/tofu`. [`env.sh`](tofu/env.sh) asks for the account ID, the token and the passphrase (paste them, since secrets aren't shown). It derives the state bucket's S3 credentials from the token, and exports what `tofu` needs into your shell without putting any of it in the shell's history:

   ```sh
   . ./env.sh
   tofu init
   tofu plan -out=nx-cache.tfplan   # check it creates a bucket, a lifecycle rule and a token
   tofu apply nx-cache.tfplan
   tofu output -raw deploy_token    # for step 6
   ```

6. **Let CI deploy**: on GitHub, *Settings* → *Environments* → *New environment* `nx-cache`, with *Deployment branches* limited to `main`, and a secret `CLOUDFLARE_API_TOKEN` holding the deploy token. Then, under *Settings* → *Secrets and variables* → *Actions* → *Variables*, add `CLOUDFLARE_ACCOUNT_ID` with the account ID.
7. **Deploy**: the next push to `main` runs the `nx-cache` job (or re-run the latest run). Its log ends with the Worker's URL, `https://leyman-nx-cache.leyman.workers.dev` (the Worker's name, then the account's `workers.dev` subdomain, `leyman`). Check it:

   ```sh
   curl -i https://leyman-nx-cache.leyman.workers.dev/v1/cache/0          # 404: nothing cached yet
   curl -i -X PUT https://leyman-nx-cache.leyman.workers.dev/v1/cache/0   # 401: no token, can't write
   ```

8. **Use it**: add the repository variable `NX_CACHE_UPSTREAM`, `https://leyman-nx-cache.leyman.workers.dev`, so CI reads from it and `main` writes to it. Devcontainers already read from it (`NX_CACHE_SERVER_UPSTREAM` in `.devcontainer/docker-compose.yml`) once their `nx-cache` sidecar restarts (`docker compose up -d nx-cache`, or rebuild). CI keeps no cache of its own, so until this is set every run starts cold.

## Changing it

- **The Worker**: change `worker/`, merge to `main`, and CI deploys it.
- **The bucket, its lifecycle or the token**: change `tofu/`, then `tofu plan` and `tofu apply` as in step 5. The deploy token has no expiry: to rotate it, `tofu apply -replace=cloudflare_account_token.deploy`, and update the environment's secret.
- **Discarding every cached result** (e.g. after finding an input Nx doesn't hash): empty the bucket from the dashboard. CI keeps nothing between runs, and each devcontainer's local results expire on their own (`NX_CACHE_SERVER_MAX_AGE_DAYS`), or delete the shared cache directory to drop them at once.
- **Removing it**: unset `NX_CACHE_UPSTREAM` and `CLOUDFLARE_ACCOUNT_ID`, delete the Worker (dashboard, or `wrangler delete`), then `tofu destroy`.

## What it doesn't fix

- Most of CI's misses are real, because a "Version Packages" commit or a lockfile change invalidates most hashes. The cache helps devcontainers most, since a fresh worktree starts with `main`'s results.
- Dagger's own layers (apt, Playwright's dependencies, `pnpm install`) still rebuild every run. Their only remote cache is Dagger Cloud, which is paid and not scoped by branch.
