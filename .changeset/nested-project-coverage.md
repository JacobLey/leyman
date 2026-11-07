---
'@leyman/nx-plugin': patch
---

`leyman-coverage-report` leaves out a project nested inside the one it reports on (a directory with its own `project.json`), which has its own coverage. `--all` counted its files as uncovered.
