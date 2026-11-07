---
"@leyman/nx-plugin": minor
---

`init` links the principles skill `@leyman/configs` ships into `.agents/skills/principles`, and `.claude/skills` to `.agents/skills`, instead of writing a `.claude/skills/principles/SKILL.md` that pointed at the docs site. Agents other than Claude Code read `.agents/skills`, and the skill now changes with the installed version. A path that already exists is left alone.
