---
description: "A hosted Nx remote cache on a Cloudflare Worker and R2, shared by CI and every devcontainer. Anyone can read it, only CI on main can write to it with GitHub OIDC; deployed with wrangler, with its bucket and tokens managed by OpenTofu."
---

# Hosted Nx cache

<ProjectHeader />

One [Nx remote cache](https://nx.dev/docs/guides/tasks--caching/self-hosted-caching) for CI and every devcontainer: a task `main` already built is a cache hit everywhere, so a fresh worktree starts warm. It runs on Cloudflare's free tiers, as a Worker in front of an R2 bucket. Anyone can read from it, and only CI on `main` can write to it.

It is also this repository's worked example of a cloud deployment. **wrangler** deploys the Worker's code from CI, and **OpenTofu**, run by hand, manages the bucket and the credentials.

## How it fits together

```
devcontainer:  Nx ──> sidecar ────────read───────> Worker ──> R2
CI (PR):       Nx ──> runner's cache ─read───────> Worker
CI (main):     Nx ──> runner's cache ─read/write─> Worker
                                     (GitHub OIDC)
```

Nx never talks to the Worker. Each devcontainer, and CI's runner, already runs a small cache server ([`nx-cache-server.mjs`](https://github.com/JacobLey/leyman/blob/main/.devcontainer/nx-cache-server.mjs)) that Nx points at, so worktrees share results. That cache server now sits in front of the Worker:

- **Reads go local first, then to the Worker.** A result fetched from the Worker is kept, timestamped when the Worker stored it, so both expire it at the same time.
- **Writes go to the Worker only from CI on `main`**, after being stored locally. The cache server requests a GitHub OIDC token itself, for each upload: tokens last minutes, longer than a CI run's first upload but shorter than the run.
- **Results in use are uploaded again before they expire.** Nx only uploads a task it ran, never one it read from the cache, so a result `main` keeps reading would still expire 7 days after it was stored. So in CI on `main`, the cache server uploads a result it serves once it is 5 days old, and the Worker accepts a result that old being replaced.
- **The Worker failing is a cache miss**, never an error: Nx runs the task instead.

CI runs the same way as before: Dagger still talks to the runner's cache server, and no credential ever enters Dagger.

## Who may write

A result written by a pull request and then served to `main` runs that pull request's code in `main`'s builds. This is called cache poisoning, and buckets that pull requests can write to have had it ([CVE-2025-36852](https://nx.dev/blog/cve-2025-36852-critical-cache-poisoning-vulnerability-creep)). So the Worker accepts a write only with a GitHub Actions OIDC token that it verifies itself, against GitHub's signing keys:

- signed with RS256 by GitHub Actions, for this cache's audience, and unexpired;
- from this repository, by its numeric ID, which unlike its name can't be renamed and claimed by someone else;
- from a `push` to `refs/heads/main`, or a `schedule` run, which always runs `main`. A pull request's token has another ref and event, and a fork's pull request gets no token at all. A `workflow_dispatch` can't write even on `main`: it runs whatever branch it is given.

There is no long-lived write secret, since each job gets its own token. The first result stored for a hash is kept until it is 5 days old, when CI may upload it again, and results expire 7 days after they were stored. Reading needs nothing: results are built from this public repository, so they hold nothing that isn't public already.

## wrangler and OpenTofu

| | Manages | Run by | Credentials |
|---|---|---|---|
| **wrangler** | The Worker's code, its binding to the bucket, its URL | CI, on every push to `main` | A token that may only deploy Workers, in a GitHub environment only `main` can use |
| **OpenTofu** | The R2 bucket, its lifecycle rule, and that deploy token | The maintainer, by hand | A token that may manage R2 and create tokens, and the state's passphrase, never in CI |

The Worker changes with the repository: it is bundled, tested and deployed on every merge, which is what wrangler is for. The bucket and the token change a few times a year, so they are applied by hand, after reading the plan.

CI never runs `tofu plan` or `tofu apply`. Reviewing plans on pull requests is the usual reason to run OpenTofu in CI, but a public repository's pull requests must never get Cloudflare credentials, so there would be no plans to review. Applying on `main` alone would put a token that can create other tokens in CI, which isn't worth it. CI does run `tofu fmt` and `tofu validate`, which need no credentials.

OpenTofu rather than Terraform, for two of its features:

- **State encryption.** The state holds the deploy token, so it is encrypted with a passphrase before it leaves the maintainer's machine for its R2 bucket.
- **Variables in the backend block**, so the state bucket's endpoint can use the account ID without committing it.

The state bucket itself is made by hand: it can't hold the state of its own creation. Its S3 credentials are derived from the OpenTofu token, so an apply takes two secrets, of which only the passphrase can't be replaced.

## Tested without the cloud

The Worker's tests run it on [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/), Cloudflare's local simulator, on workerd, the runtime Cloudflare runs Workers on, with a real R2 bucket in memory. A stand-in OIDC issuer signs tokens and serves its keys, so every rule above is tested: tokens of other repositories, branches and events, expired and badly signed ones, rotated keys, and GitHub's keys being unreachable. The time is passed in, so expiry is tested without waiting. 100% coverage, like every package here.

## Cost

Nothing: it fits in Cloudflare's free tiers, and can't go over them by much:

- **Requests**: the Workers free plan stops at 100k requests a day rather than billing, and every read or write goes through the Worker. So R2's reads (10M a month free) and writes (1M) can't be run up, even by a flood of requests: unauthorized writes are rejected before they touch R2.
- **Storage** is the one thing that could go past the free 10 GB, as results live up to 8 days. At R2's price, a few GB over is a few cents a month.
- The worst a flood of reads can do is use up a day's requests: the cache then misses until the next day, and nothing is charged.

## What it doesn't fix

- Many misses are real: a lockfile change or a "Version Packages" commit invalidates most task hashes. The cache helps devcontainers most.
- Dagger's own layers (system packages, `pnpm install`) still rebuild on every CI run. Their only remote cache is Dagger Cloud, which is paid, and not scoped by branch.

Setting it up, and changing it later, is in the [runbook](https://github.com/JacobLey/leyman/blob/main/infra/nx-cache/README.md).
