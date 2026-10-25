# @leyman/nx-cache-worker

The hosted Nx remote cache: a Cloudflare Worker on R2 that implements Nx's [self-hosted remote cache API](https://nx.dev/docs/guides/tasks--caching/self-hosted-caching) (`GET` and `PUT /v1/cache/{hash}`). Private: it is deployed, never published. See [`../README.md`](../README.md) for how it fits with the devcontainer, CI and OpenTofu.

## Who may read and write

- **Anyone may read.** Results are built from this public repository, and are public anyway (the repository and npm).
- **Only CI on `main`, from a push or a scheduled run, may write.** A `PUT` needs a GitHub Actions OIDC token, which the Worker verifies itself against GitHub's signing keys: RS256, `iss` GitHub Actions, `aud` `leyman-nx-cache`, unexpired, and `repository_id`, `ref == refs/heads/main`, and `event_name` `push` or `schedule`. Not `workflow_dispatch`: it runs whatever branch it is given. So no pull request, from a fork or not, can write a result that `main` later trusts (cache poisoning, e.g. CVE-2025-36852). The repository's numeric ID is checked rather than its name, which could be renamed and taken by someone else.
- **The first result for a hash is kept**: a second `PUT` is a 409, as with the devcontainer's cache server. Once the result is 5 days old (`refreshAfterDays`), a `PUT` replaces it: CI re-uploads a result it still reads, so it doesn't expire while in use.
- **Results expire 7 days after they were stored** (`maxAgeDays`): never served after, and replaced by the next `PUT`. The bucket's lifecycle rule deletes them, some time later.
- `Last-Modified` on a result is when it was stored, so the cache server in front of this one expires its copy at the same time.

A `PUT` needs a `Content-Length` (411 without one): R2 only stores a stream of known length. Tokens are checked without any library: WebCrypto verifies the signature, and GitHub's keys are kept for an hour, or until a token is signed with a key that isn't among them.

## Configuration

`wrangler.jsonc`: the bucket binding (`cache`), and the variables above. `compatibility_date` is the newest the tests' Miniflare supports, so the tests run with the runtime's production behaviour.

## Tests

Against a real R2 bucket, in memory, from [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/) (the Workers runtime, workerd, run locally), and a stand-in OIDC issuer that signs tokens and serves its keys. Most tests call the Worker's handler from Node, with the current time passed in, so expiry is tested without waiting; one runs the built Worker on workerd itself.

```sh
nx run @leyman/nx-cache-worker:test
```
