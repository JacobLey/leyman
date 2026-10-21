---
"pg-dolly": minor
---

`template(sql, { seed })` runs SQL after the schema, into the template, for data every test starts from. The seed is part of the template's hash, so a changed seed builds a new template.
