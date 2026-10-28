<div style="text-align:center">

# trusted-tsc
Run TypeScript 7.1's tsc with only the content mappers you trust, each in Node's permission sandbox.

</div>

- **An allowlist TypeScript doesn't have.** `tsc --runExternalCode` runs every content mapper a tsconfig names, including one an `extends` brings in. `trusted-tsc` passes the flag only once every mapper is listed in your `package.json`, so adding one is a reviewed change.
- **Sandboxed.** Each mapper runs under Node's permission model. It can read its own package and its dependencies, and not your project, home directory or credentials. It can't write files or start processes either.
- **Drop-in.** `trusted-tsc -p test` takes `tsc`'s arguments, runs the native `tsc`, and exits with its code. A project without content mappers runs as plain `tsc`.
- **Checkable.** `trusted-tsc --check` refuses the same mappers without running `tsc`, for CI.
- **No dependencies.**

**Requires TypeScript 7.1** (`typescript@7.1.0-beta` or later), whose content mappers may still change before its stable release. Private for now, and not on npm yet.

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

It reads the project's tsconfig (from `-p`/`--project`, or `tsconfig.json` in the working directory) and its `contentMappers`, following `extends` as TypeScript does: a tsconfig's own list replaces any it inherits. Then it checks each mapper:

- It is named in `trustedContentMappers`, in the `package.json` nearest the tsconfig.
- It is installed where TypeScript resolves it from: the project's `node_modules`, or one above it.
- Its `typescript.contentMapper.exec` runs `node`, and doesn't set Node's permissions itself.

If they all pass, it runs `tsc` with `--runExternalCode`, in the sandbox. With `--check`, it lists the mappers instead of running `tsc`:

```
genever-content-mapper@1.0.0: trusted, sandboxed
1 content mappers in /repo/app/tsconfig.json
```

It runs the `tsc` executable of the project's TypeScript: the dependency (or devDependency) in that `package.json` that is the `typescript` package, 7.1 or later, under any name.

It refuses `--runExternalCode` (the allowlist replaces it) and `--build` (run each project with `-p`, in dependency order), and exits with `1` when it refuses. Otherwise it exits with `tsc`'s code.

## The sandbox

`trusted-tsc` runs `tsc` with `NODE_OPTIONS` set to `--permission`, plus an `--allow-fs-read` for each directory the mappers need: each mapper's package, each of its dependencies (including optional and peer ones), and, for a dependency installed as a link (as pnpm does), the `node_modules` directory that holds the link. `tsc` passes its environment to the mapper processes it starts, so each one runs with these permissions, and nothing else:

- **Reading** only those directories. TypeScript sends a mapper each file's contents, so it never needs to read your project.
- **No writing** files, starting processes, worker threads, native addons or WASI.

It runs the native `tsc` executable directly, since the `tsc` command is a Node script, which the sandbox would stop.

Other `NODE_OPTIONS` are kept, unless they set permissions themselves (`--allow-*`, `--permission`), which `trusted-tsc` refuses. So does a mapper whose `exec` sets them.

## Limitations

- **The network and environment variables are open.** Node's permission model doesn't cover them yet. A mapper can still read `process.env` and make requests. Don't run mappers in jobs that hold secrets.
- **Node mappers only.** A mapper run by anything other than `node` is refused, as nothing would sandbox it.
- **Editors aren't covered.** The language server runs mappers itself, gated by workspace trust and its content mapper permission, not by `trusted-tsc`. `--check` in CI catches a mapper an editor would run.
- **Linux and macOS.** It doesn't look for `tsc.exe` yet.
- **One project at a time.** No `--build`, and only `contentMappers` of the project itself (not of its references) are checked.

## Also See

- [`genever-content-mapper`](../genever-content-mapper/): types an imported OpenAPI document or JSON Schema, and is built to run in this sandbox.
