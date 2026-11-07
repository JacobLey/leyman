---
'populate-files': patch
---

`populateFiles` decides every file before writing or removing any, so a refusal (such as an edited file it may not overwrite) leaves every file as it was. It used to write files in parallel, so other files could already be written when one was refused. `populateFile` likewise decides its file and manifest before writing either.
