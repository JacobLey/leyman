---
"haywire-launcher": minor
---

`launch(container, id, { dispose: true })` disposes the container once `main()` resolves or rejects, or when getting the id from the container fails. If disposing fails after `main()` rejected, the script rejects with a `SuppressedError` of both, as `await using` does. Off by default, because a `main()` that starts a server returns while the server keeps running.
