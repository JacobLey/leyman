# generated-signature-test-vectors

Test vectors shared by every [generated-signature](../ts/) implementation.

Each implementation depends on this package, through its own package manager, and asserts that it produces exactly these signatures, sections, hashes and manifests. So a file that the TypeScript package signs, merges or lists in a manifest is read the same way by the [Go implementation](../go/).

```ts
import testVectors from '@leyman/generated-signature-test-vectors/test-vectors.json' with { type: 'json' };
```

Implementations in other languages, such as the [Go implementation](../go/), read [`data/test-vectors.json`](./data/test-vectors.json) by path, from the working copy, so a published module needs no module of vectors.

## Format

Each list's cases have a `description`, and are named after the TypeScript function they check:

| List                | Input                                | Expected                                                      |
| ------------------- | ------------------------------------ | ------------------------------------------------------------- |
| `commentStyles`     | `filePath`                           | `style` (`{ start, end? }`), or `null`                        |
| `sign`              | `text`, and `options` when given     | `signed`, or `error`                                          |
| `verify`            | `text`                               | `status`, with `reason` and `line` when `malformed`           |
| `sections`          | `text`                               | `sections` (`id`, `body`, `startLine`, `endLine`), or `error` |
| `merge`             | `generated`, `existing`              | `result` (`text`, `orphans`), or `error`                      |
| `manualSection`     | `options`                            | `text`, or `error`                                            |
| `contentHash`       | `text`                               | `hash`                                                        |
| `manifestEntries`   | `content` (hashed as UTF-8), `entry` | `status`, as in `verify`                                      |
| `parseManifest`     | `text`                               | `files`, or `error`                                           |
| `serializeManifest` | `files`                              | `text`                                                        |

An `error` has a `kind`: `malformed` (with the `reason` and `line`), `missing-comment-style` (text without a token, signed without options), `unknown-comment-style`, `section-id` or `manifest`.

The expected values pin the file format, so changing any of them is a breaking change to every implementation, and to files already signed.

It is not published, and should not be depended on by published code.
