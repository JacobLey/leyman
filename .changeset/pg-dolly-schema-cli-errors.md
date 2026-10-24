---
"pg-dolly-schema": patch
---

The CLI prints only the message of an expected failure (a failed migration, a missing `DATABASE_URL`, an outdated file with `--check`), without a stack trace, and exits with code 1.
