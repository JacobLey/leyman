# e2e-xenever-oracle

Checks xenever against libxml2 (xmllint) and the W3C XML Schema and XML conformance test suites.

A validator is only as good as its agreement with the specification, and the specification is long. This package holds [`xenever`](../../apps/xenever) to two independent references: `xmllint --schema` from libxml2 (through [`xmllint-wasm`](https://www.npmjs.com/package/xmllint-wasm), so nothing is installed), and the test suites the W3C publishes with the specifications. The typed parse (`loadXsd`, then `parse`) should accept exactly what xmllint accepts, and both should match what the suites expect.

It is not published, and has no source of its own, only tests.

## What runs

- **A hand-written corpus** (`test/data/`): a schema using every construct of xenever's v1 subset, with instances named `valid-*` or `invalid-*`. Both xenever and xmllint must agree with the name.
- **The W3C XML Schema test suite** ([w3c/xsdtests](https://github.com/w3c/xsdtests)): the XSD 1.0 test sets (NIST, Sun, Microsoft, Boeing), accepted or stable tests only, with each test's XSD 1.0 expectation. A schema using a construct outside xenever's subset (abstract types, `xs:redefine`, XSD 1.1 syntax...) must fail with `XeneverUnsupportedError`. Every other test must have xenever, xmllint and the suite agree, be one of xenever's known limits (an unsupported facet, say), or be listed in [`xsdtests-expected.ts`](./test/lib/xsdtests-expected.ts) with the reason and the section of the specification. A listed test that starts to agree fails too, so the list never goes stale.
- **The W3C XML conformance suite** ([xmlts20130923](https://www.w3.org/XML/Test/)): every document that is not well-formed XML 1.0 (Fifth Edition, with namespaces) and every Namespaces in XML 1.0 test, through `parse` with a schema that allows anything. A document that is not well-formed, and any document with a DTD, must throw `XeneverXmlError`; any other must not.

Each run prints its counts, and the expected disagreements by category.

## The suites

Neither suite is on npm. `test/suites.json` pins each one to a URL (a commit of `w3c/xsdtests`) and the sha256 of its tarball. The `fetch-suites` target downloads them into the gitignored `.suites/` before the tests, checking each against its hash. Nx caches the target with only the tarballs as outputs, so a fresh worktree or a CI run restores them from the cache; the script also skips a tarball that already has the pinned hash. Tests extract a tarball into a temporary directory and delete it afterwards.

To move to a newer commit of a suite, change its URL and hash in `test/suites.json`, and update the expected disagreements to what the new tests find.

The suites are only downloaded, never committed. The XML Schema suite is the W3C's, under the [W3C Document Notice and License](http://www.w3.org/Consortium/Legal/copyright-documents-19990405.html) its `00COPYRIGHT` names; the XML conformance suite collects tests from several contributors, under the copyrights in each one's files.
