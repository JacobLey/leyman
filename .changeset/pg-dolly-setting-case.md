---
"pg-dolly": patch
---

Treat setting names as case-insensitive, as Postgres does. `settings: { TIMEZONE: 'America/New_York' }` used to be overridden by the default `TimeZone: 'UTC'`, as both were set and the default sorted last. Templates are built once again, as the names in their hash are now lowercase.
