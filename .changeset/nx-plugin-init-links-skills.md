---
"@leyman/nx-plugin": minor
---

`init` has pnpm link the skills the framework's packages ship for coding agents (`@leyman/configs`' principles, and those of `@leyman/eslint-config`, `mocha-chain` and `nx-lifecycle`): it approves them under `permissions` in `pnpm-workspace.yaml`, sets `skills.dirs` to `.agents/skills`, and links `.claude/skills` to `.agents/skills`. It no longer writes a `.claude/skills/principles/SKILL.md` pointing at the docs site, so the principles change with the installed version. Needs pnpm 12.11 or later to link; settings already there are left alone.
