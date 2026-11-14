---
"@leyman/eslint-config": minor
---

Replace the deprecated rules still on with their maintained successors. `multiline-comment-style` and `spaced-comment` become `@stylistic/multiline-comment-style` and `@stylistic/spaced-comment` from `@stylistic/eslint-plugin`, with the same options. `@typescript-eslint/sort-type-constituents` becomes `perfectionist/sort-union-types` and `perfectionist/sort-intersection-types` from `eslint-plugin-perfectionist`, with the same order of kinds. Within a kind, members now sort naturally ignoring whitespace, so some unions need reordering: number literals come before string literals (`0 | ''`), a string before the longer strings it starts (`'date' | 'date-time'`), and a multi-line object or tuple type no longer sorts first for its line break. An intersection with a function or constructor type keeps its order, which can change the type, where the old rule sorted it too. Only these four rules of the two plugins are on.
