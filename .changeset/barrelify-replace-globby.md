---
"barrelify": patch
---

Find files with `tinyglobby` and apply `.gitignore` rules itself, instead of with `globby`, whose `micromatch` dependency pulls in `braces` (vulnerable to a stack-exhaustion denial of service, with no fix released). `.gitignore` files are read once per run instead of once per barrel file. Outside a Git repository, a `.gitignore` in the searched directory now also applies to the siblings of barrel files in its subdirectories.
