---
"genever": minor
---

Add `--manifest` (`manifest`): records the output in a populate-files manifest, with hashes of every file and URL read, genever's version and the options. With `--ci`, an output whose entry still matches is up to date without loading anything, so CI no longer fetches remote schemas, or fails when one changes upstream.
