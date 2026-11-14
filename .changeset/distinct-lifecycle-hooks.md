---
"nx-lifecycle": patch
---

Reject hook and stage names that generate the same target twice: a hook listed twice, a hook named `_` (which is the stage's anchor), or a stage named like another stage's target (`build:run` beside `build`'s hook `run`). Previously the later target silently replaced the earlier one, so a repeated hook depended on itself. Empty hook names are rejected too, and the schema now requires hooks to be unique, non-empty and not `_`.
