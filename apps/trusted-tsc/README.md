<div style="text-align:center">

# trusted-tsc

Run TypeScript 7.1's tsc with only the content mappers you trust, each in Node's permission sandbox.

</div>

TypeScript 7.1's content mappers let `tsc` type an import of a file that isn't TypeScript, like an OpenAPI document, by sending its contents to a mapper process. `tsc` only starts those processes with `--runExternalCode`, and that flag runs every content mapper a tsconfig names, including one that an `extends` brings in. TypeScript has no allowlist for them.

`trusted-tsc` is a wrapper around `tsc` that passes `--runExternalCode` only once every mapper is listed in your `package.json`, so adding one is a reviewed change. Each mapper then runs under Node's permission model. It can read its own package and its dependencies, but not your project, home directory or credentials. It can't write files or start processes either, and it sees only a few environment variables, so your tokens don't reach it.

`trusted-tsc -p test` takes `tsc`'s arguments, runs the native `tsc`, and exits with its code. A project without content mappers runs as plain `tsc`, with your whole environment. For CI, `trusted-tsc --check` refuses the same mappers without running `tsc`. It has no dependencies.

It requires TypeScript 7.1 (`typescript@7.1.0-beta` or later), whose content mappers may still change before the stable release. The package is private for now, and not on npm yet.

## Contents

- [Example](#example)
- [Usage](#usage)
- [The sandbox](#the-sandbox)
- [Limitations](#limitations)
- [Also See](#also-see)

## Example

List the content mappers you trust in the `package.json` of the project that uses them:

```json
{
    "devDependencies": {
        "genever-content-mapper": "^1.0.0",
        "typescript": "7.1.0-beta"
    },
    "trustedContentMappers": ["genever-content-mapper"]
}
```

Register them in `tsconfig.json` as usual:

```json
{
    "compilerOptions": { "strict": true },
    "contentMappers": [{ "package": "genever-content-mapper", "extensions": [".openapi.yaml"] }]
}
```

Then run `trusted-tsc` wherever you'd run `tsc`, without `--runExternalCode`:

```sh
trusted-tsc -p .
```

A mapper that isn't listed stops it before `tsc` runs:

```
trusted-tsc: Content mapper 'other-mapper' isn't trusted: add it to trustedContentMappers in the package.json of /repo/app.
```

## Usage

`trusted-tsc [--check] [tsc arguments]`

It reads the project's tsconfig (from `-p`/`--project`, or `tsconfig.json` in the working directory) and its `contentMappers`, following `extends` as TypeScript does, so a tsconfig's own list replaces any it inherits. Then it checks each mapper:

- It is named in `trustedContentMappers`, in the `package.json` nearest the tsconfig.
- It is installed where TypeScript resolves it from (the project's `node_modules`, or one above it).
- Its `typescript.contentMapper.exec` runs `node`, and doesn't set Node's permissions itself.

If they all pass, it runs `tsc` with `--runExternalCode`, in the sandbox. With `--check`, it lists the mappers instead of running `tsc`:

```
genever-content-mapper@1.0.0: trusted, sandboxed
1 content mappers in /repo/app/tsconfig.json
```

It runs the `tsc` executable of the project's TypeScript, which is the dependency (or devDependency) in that `package.json` that is the `typescript` package, 7.1 or later, under any name.

It refuses `--runExternalCode` (the allowlist replaces it) and `--build` (run each project with `-p`, in dependency order), and exits with `1` when it refuses. Otherwise it exits with `tsc`'s code.

## The sandbox

`trusted-tsc` runs `tsc` with `NODE_OPTIONS` set to `--permission`, plus an `--allow-fs-read` for each directory the mappers need: each mapper's package, each of its dependencies (including optional and peer ones), and, for a dependency installed as a link (as pnpm does), the directory holding the link, and that of any link it leads through. `tsc` passes its environment to the mapper processes it starts, so each one runs with these permissions, and nothing else:

- It can read only those directories. TypeScript sends a mapper each file's contents, so it never needs to read your project.
- It can't write files, or start processes, worker threads, native addons or WASI.
- It sees only a few environment variables: `PATH` (to find `node`), `tsc`'s color settings (`TERM`, `COLORTERM`, `NO_COLOR`, `FORCE_COLOR`), `TMPDIR`, `TZ`, the Go runtime's `GOGC`, `GOMAXPROCS` and `GOMEMLIMIT` (`tsc` is written in Go), and `NODE_OPTIONS`. `tsc` runs with only these too, so a token or key in your shell or CI job doesn't reach a mapper.

It runs the native `tsc` executable directly, since the `tsc` command is a Node script, which the sandbox would stop.

Other `NODE_OPTIONS` are kept, unless they set permissions themselves (`--allow-*`, `--permission`), which `trusted-tsc` refuses. So does a mapper whose `exec` sets them.

## Limitations

- The network is open. Node's permission model doesn't cover it yet, so a mapper can still make requests. It has no secrets to send, but it can send what it maps, which is your documents.
- Only Node mappers can run. A mapper run by anything other than `node` is refused, since nothing would sandbox it.
- Editors aren't covered. The language server runs mappers itself, and they are gated by workspace trust and its content mapper permission instead of by `trusted-tsc`. `--check` in CI catches a mapper an editor would run.
- It only works on Linux and macOS, since it doesn't look for `tsc.exe` yet.
- It checks one project at a time. There is no `--build`, and only `contentMappers` of the project itself (not of its references) are checked.

## Also See

- [`genever-content-mapper`](../genever-content-mapper/): types an imported OpenAPI document or JSON Schema, and is built to run in this sandbox.
