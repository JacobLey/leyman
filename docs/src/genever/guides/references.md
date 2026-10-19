---
description: Generate one file of types from a schema that references other files and URLs.
---

# References to other files

A `$ref` may point at another file, or a URL, relative to the schema it is in: `{ "$ref": "./address.json" }`, `{ "$ref": "https://example.com/schemas/user.json#/$defs/Name" }`. The CLI and `geneverFile` load each one, and everything it references in turn, and the output is still one file:

- Each referenced file becomes a type named after its `title`, or else its file name (`address.json` is `Address`). Two of the same name are numbered (`Address2`).
- A file referenced twice is one type.
- A file that only holds `$defs` (shared definitions) is not a type itself, but its definitions are, when referenced.
- Files without a `$schema` are read in the input's dialect: JSON Schema 2020-12, or the OpenAPI version of an OpenAPI document.
- A file or URL that can't be loaded throws a `GeneverLoadError`.
- A `.yaml` or `.yml` file, or a URL served as YAML, is read as YAML. See [YAML](/genever/reference/api#yaml).

Loaded files are embedded with an absolute `$id`, following the bundling process of JSON Schema 2020-12, so `$ref`s resolve to them unchanged, and `$id` and `$anchor` inside them work as in the original files. `--no-fetch` (or `fetch: false`) loads files only, never URLs: a `$ref` to a URL fails with a `GeneverLoadError`, unless a loaded schema declares that URL as its `$id`, such as a copy committed next to the input. `--fetch-host example.com` (or `fetch: ['example.com']`) loads only URLs of the hosts listed, and only follows redirects to them. A host matches on any port unless it names one (`localhost:8080`), and `*.example.com` matches subdomains of `example.com`, but not `example.com` itself. `genever()` itself reads one document, and doesn't load anything: bundle first, or use `geneverFile`.

## Example

```json
// user.json
{
  "type": "object",
  "properties": {
    "home": { "$ref": "./address.json" },
    "work": { "$ref": "./address.json" }
  },
  "required": ["home"]
}
```

```json
// address.json
{ "title": "Address", "type": "object", "properties": { "city": { "type": "string" } } }
```

`npx genever user.json --name User` writes one `user.ts`:

```ts
export type User = {
    home: Address;
    work?: Address;
};

export type Address = {
    city?: string;
};
```

Run genever again whenever a referenced file changes: `--ci` checks the generated file against every file it references, as of the run.
