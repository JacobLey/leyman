---
"genever": minor
---

Load URLs from only some hosts: `fetch: ['example.com', '*.example.com']` in `geneverFile`, or `--fetch-host` (repeatable) in the CLI. A host matches on any port unless it names one, and `*.example.com` matches its subdomains. Redirects are only followed to allowed hosts.
