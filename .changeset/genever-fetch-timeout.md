---
"genever": patch
---

`geneverFile` (and the CLI) gives each URL 30 seconds to load, its redirects and body included, and then fails with a `GeneverLoadError` (`timed out after 30000 ms`), instead of waiting forever on a server that never answers. The bodies of redirects and failed responses are cancelled rather than left unread.
