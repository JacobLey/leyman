# @leyman/nx-cache-worker

The hosted Nx remote cache, a Cloudflare Worker on R2 that anyone can read from and only CI on main can write to.

It implements Nx's [self-hosted remote cache API](https://nx.dev/docs/guides/tasks--caching/self-hosted-caching) (`GET` and `PUT /v1/cache/{hash}`). The package is private, since it is deployed rather than published. See [`../README.md`](../README.md) for how it fits with the devcontainer, CI and OpenTofu.

## Who may read and write

Anyone may read. Results are built from this public repository, so they are public anyway (through the repository and npm).

Only CI on `main`, from a push or a scheduled run, may write. A `PUT` needs a GitHub Actions OIDC token, which the Worker verifies itself against GitHub's signing keys. The token must be:

- signed with RS256, with `iss` GitHub Actions and `aud` `leyman-nx-cache`, and unexpired;
- for this repository's `repository_id`, the numeric ID, which is checked rather than the name because a name could be renamed and taken by someone else;
- for `ref == refs/heads/main`, with `event_name` `push` or `schedule`. `workflow_dispatch` isn't accepted, because it runs whatever branch it is given.

So no pull request, from a fork or not, can write a result that `main` later trusts (cache poisoning, e.g. CVE-2025-36852).

The first result stored for a hash is kept, and a second `PUT` gets a 409, as with the devcontainer's cache server. Once the result is 5 days old (`refreshAfterDays`), a `PUT` replaces it, so CI can re-upload a result it still reads and keep it from expiring while in use.

Results expire 7 days after they were stored (`maxAgeDays`). After that they aren't served, and the next `PUT` replaces them. The bucket's lifecycle rule deletes them some time later. `Last-Modified` on a result is when it was stored, so the cache server in front of this one expires its copy at the same time.

A `PUT` needs a `Content-Length`, and gets a 411 without one, because R2 only stores a stream of known length. Tokens are checked without any library. WebCrypto verifies the signature, and GitHub's keys are kept for an hour, or until a token is signed with a key that isn't among them.

## Configuration

`wrangler.jsonc` holds the bucket binding (`cache`) and the variables above. `compatibility_date` is the newest the tests' Miniflare supports, so the tests run with the runtime's production behavior.

## Tests

The tests run against a real R2 bucket, in memory, from [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/) (the Workers runtime, workerd, run locally), and a stand-in OIDC issuer that signs tokens and serves its keys. Most tests call the Worker's handler from Node, with the current time passed in, so expiry is tested without waiting; one runs the built Worker on workerd itself.

```sh
nx run @leyman/nx-cache-worker:test
```
