# Hosted Nx remote cache

One Nx cache for CI and every devcontainer, on Cloudflare: anyone can read it, only CI on `main` can write to it. Also this repository's worked example of a cloud deployment, split between two tools by what each is good at. Written up for readers on the docs site: [Hosted Nx cache](https://jacobley.github.io/leyman/infrastructure/nx-cache/). This README is the maintainer's runbook.

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

- **Writes need a GitHub OIDC token from a push to `main`**, which the Worker checks itself. No pull request, from a fork or not, can write a result that `main` then trusts: that is cache poisoning, e.g. CVE-2025-36852 against bucket-backed Nx caches. There is no long-lived write secret to leak: the token is minted per job, lasts minutes, and the cache server requests a new one as it expires.
- **Reads are public.** Results are built from this public repository: nothing in them isn't already public.
- **Nx never talks to the Worker directly.** The existing cache server reads through to it and, on `main`, writes through. So Dagger's wiring didn't change, credentials never enter Dagger, and the hosted cache being down is only a slower run.
- **Two tools, split by who runs them.** OpenTofu owns what is set up once and holds credentials, run by the maintainer. A public repository's pull requests must never get Cloudflare credentials, so CI only runs `tofu fmt` and `tofu validate`, never `plan`. wrangler owns the Worker's code, which changes with the repository: CI deploys it from an environment only `main` can use, with a token that may only deploy Workers. wrangler's Miniflare also runs the Worker locally for its tests.
- **OpenTofu, not Terraform**: its state encryption keeps the deploy token unreadable in the state bucket, and its backend block can use variables (the account ID).
- **Free tier**: R2 gives 10 GB, 1M writes and 10M reads a month; Workers 100k requests a day. A cold CI run makes about 1.4k reads and 1.4k writes, and results expire after 7 days. Keep the account on the Workers free plan: its daily limit stops requests rather than billing them, and since the bucket is reachable only through the Worker, a flood of public reads can at worst make the cache unavailable until the limit resets, never cost anything. On Workers Paid, both would be billed per request, without a cap.

## Setting it up

Done once, by the maintainer. You need a Cloudflare account with R2 enabled (R2 asks for a payment method even on the free tier) and a `workers.dev` subdomain (the dashboard's Workers page offers one on first visit). Then, in the devcontainer, which has `tofu` (rebuild it if `tofu version` isn't found):

1. **Find your account ID**: the 32 hex characters after `dash.cloudflare.com/` in any dashboard URL (also on the account's home page).
2. **Make the state bucket by hand**: R2 → *Create bucket*, named `leyman-tofu-state`. It can't be managed by OpenTofu, as it holds the state of everything OpenTofu creates.
3. **Make a token for OpenTofu**: My Profile → *API Tokens* → *Create Token* → *Custom token*, for your account: *Workers R2 Storage: Edit* and *Account API Tokens: Edit*. It creates the cache bucket and the deploy token, and reaches the state bucket too: R2's S3 credentials are derived from it.
4. **Choose a passphrase** for the state's encryption, at least 16 characters. Keep it, and the token, in a password manager. The passphrase is the one secret that can't be replaced: without it the state can't be read (the resources stay, and could be imported again). The token can be remade at any time, or created with an expiry for each apply.
5. **Apply**, from `infra/nx-cache/tofu`. [`env.sh`](tofu/env.sh) asks for the account ID, the token and the passphrase (paste them: secrets aren't shown), derives the state bucket's S3 credentials from the token, and exports what `tofu` needs into your shell, never its history:

   ```sh
   . ./env.sh
   tofu init
   tofu plan -out=nx-cache.tfplan   # check it creates a bucket, a lifecycle rule and a token
   tofu apply nx-cache.tfplan
   tofu output -raw deploy_token    # for step 6
   ```

6. **Let CI deploy**: on GitHub, *Settings* → *Environments* → *New environment* `nx-cache`, with *Deployment branches* limited to `main`, and a secret `CLOUDFLARE_API_TOKEN`: the deploy token. Then *Settings* → *Secrets and variables* → *Actions* → *Variables*: `CLOUDFLARE_ACCOUNT_ID`, the account ID.
7. **Deploy**: the next push to `main` runs the `nx-cache` job (or re-run the latest run). Its log ends with the Worker's URL, `https://leyman-nx-cache.leyman.workers.dev` (the Worker's name, then the account's `workers.dev` subdomain, `leyman`). Check it:

   ```sh
   curl -i https://leyman-nx-cache.leyman.workers.dev/v1/cache/0          # 404: nothing cached yet
   curl -i -X PUT https://leyman-nx-cache.leyman.workers.dev/v1/cache/0   # 401: no token, can't write
   ```

8. **Use it**: add the repository variable `NX_CACHE_UPSTREAM`, `https://leyman-nx-cache.leyman.workers.dev`, so CI reads from it and `main` writes to it. Devcontainers already read from it (`NX_CACHE_SERVER_UPSTREAM` in `.devcontainer/docker-compose.yml`) once their `nx-cache` sidecar restarts (`docker compose up -d nx-cache`, or rebuild).
9. **Later**, once it has worked for a while, remove the `actions/cache` steps from `.github/workflows/ci.yml`: the hosted cache replaces them.

## Changing it

- **The Worker**: change `worker/`, merge to `main`, and CI deploys it.
- **The bucket, its lifecycle or the token**: change `tofu/`, then `tofu plan` and `tofu apply` as in step 5. The deploy token has no expiry: to rotate it, `tofu apply -replace=cloudflare_account_token.deploy`, and update the environment's secret.
- **Discarding every cached result** (e.g. after finding an input Nx doesn't hash): empty the bucket from the dashboard, and bump `NX_CACHE_VERSION` in `ci.yml` for the runner's own cache.
- **Removing it**: unset `NX_CACHE_UPSTREAM` and `CLOUDFLARE_ACCOUNT_ID`, delete the Worker (dashboard, or `wrangler delete`), then `tofu destroy`.

## What it doesn't fix

- Most of CI's misses are real: a "Version Packages" commit or a lockfile change invalidates most hashes. It helps devcontainers most: a fresh worktree starts with `main`'s results.
- Dagger's own layers (apt, Playwright's dependencies, `pnpm install`) still rebuild every run. Their only remote cache is Dagger Cloud, which is paid and not scoped by branch.
