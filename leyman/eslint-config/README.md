# eslint-confg

This package contains a shared eslint-config for re-use internally across leyman packages.

It is not published publically, because the rule set is hyper-opinionated and would often include changes that could be consider breaking.

However users are welcome to directly reference or copy this code if they wish to emulate similar eslint rules in their packages.

## Publishing

During `changeset version`, it will try to create a `CHANGELOG.md` for this package because one does not exist yet. 
It will also impossible to exclude this package since it has dependants that are not excluded.

However we should always delete/ignore that `CHANGELOG.md`, because as noted above we do not actually publish/version this package.
Any changes that impact dependencies are immediately reflected in those packages, who _should_ reflect their changes via changesets.