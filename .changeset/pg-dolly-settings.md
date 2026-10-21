---
"pg-dolly": minor
---

`settings` replaces `timeZone`: every database pg-dolly creates, the template while it is built included, gets the same database settings. The defaults (`defaultSettings`) pin what `initdb` takes from the machine (`TimeZone`, `DateStyle`, `lc_monetary`, `lc_numeric`, `lc_time` and `default_text_search_config`), so the server's configuration doesn't change what queries return. Settings are part of the template's hash, and an invalid one fails `template()` rather than every clone.
