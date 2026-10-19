---
paths:
  - "apps/barrelify/src/**"
  - "apps/barrelify/README.md"
  - "apps/genever/src/**"
  - "apps/genever/README.md"
  - "apps/genever/WHY-GENEVER.md"
  - "apps/juniper/src/**"
  - "apps/juniper/README.md"
  - "apps/juniper/WHY-JUNIPER.md"
  - "apps/juniper-validator/src/**"
  - "apps/juniper-validator/README.md"
  - "apps/nx-lifecycle/src/**"
  - "apps/nx-lifecycle/README.md"
  - "apps/nx-lifecycle/WHY-NX-LIFECYCLE.md"
  - "apps/populate-files/*/src/**"
  - "apps/populate-files/*/README.md"
  - "tools/generated-signature/generated-signature/src/**"
  - "tools/generated-signature/generated-signature/README.md"
  - "tools/haywire/src/**"
  - "tools/haywire/README.md"
  - "tools/haywire/WHY-HAYWIRE.md"
  - "tools/unknown-error/src/**"
  - "tools/unknown-error/README.md"
  - "tools/unknown-error/WHY-UNKNOWN-ERROR.md"
---

# Documented package

This package has pages on the docs site, in `docs/src/<package>/`. A change to its API, behaviour, defaults, CLI flags or errors must update those pages in the same commit, then pass `nx run @leyman/docs:build`. The build only catches type errors in examples, not changed behaviour, so grep the pages for what changed. See the [docs-site skill](../skills/docs-site/SKILL.md#keeping-pages-in-sync).
