// Checks that the versions the devcontainer and CI pin separately still match, so `dagger-test` can't run under a
// different runtime than local development (see "Version parity" in the devcontainer skill).
//
// Each value stays where it is used, and is read with a pattern anchored on its name. A value that can't be found
// fails too, so renaming a pin can't quietly drop it from the check.
//
// Has no dependencies, because CI's `test` job runs it straight from the checkout, with no `node_modules`.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '../../..');

const dockerfile = '.devcontainer/Dockerfile';
const compose = '.devcontainer/docker-compose.yml';
const workflow = '.github/workflows/ci.yml';
const wrangler = 'infra/nx-cache/worker/wrangler.jsonc';

// `BASE_IMAGE` names the Debian release by number, every other image by codename
const debianCodenames = new Map([['13', 'trixie']]);

// Reads the `value` group of the pattern's first match, in the file or in what follows the `after` marker
const read = (file, pattern, name, after = '') => {
    const text = readFileSync(path.join(workspaceRoot, file), 'utf8');
    const start = text.indexOf(after);
    return {
        label: `${file} (${name})`,
        value: start === -1 ? undefined : pattern.exec(text.slice(start))?.groups?.value,
    };
};

const dockerArg = name => read(dockerfile, new RegExp(`^ARG ${name}=(?<value>.+)$`, 'mv'), name);
const daggerConst = name =>
    read('dagger/main.go', new RegExp(String.raw`^\s+${name} += "(?<value>.+)"$`, 'mv'), name);
const composeImage = service =>
    read(compose, /^ {4}image: (?<value>.+)$/mv, `${service} image`, `\n  ${service}:\n`);
const workflowEnv = name => read(workflow, new RegExp(`^  ${name}: (?<value>.+)$`, 'mv'), name);
const wranglerVar = name =>
    read(wrangler, new RegExp(String.raw`^\s+"${name}": "(?<value>.+)",?$`, 'mv'), name);

const mapped = ({ label, value }, transform) => ({
    label,
    value: value === undefined ? undefined : transform(value),
});

// `node:24.22.1-trixie-slim@sha256:...` has the tag `24.22.1-trixie-slim`
const imageTag = image => image.split('@', 1)[0].split(':').at(-1);
const imageVersion = source =>
    mapped(source, image => imageTag(image).split('-', 1)[0].replace(/^v/v, ''));
const imageVariant = source => mapped(source, image => imageTag(image).split('-', 2)[1]);

const majorMinor = source => mapped(source, version => version.split('.', 2).join('.'));
const major = source => mapped(source, version => version.split('.', 1)[0]);

const checks = () => ({
    'Node version': [dockerArg('NODE_VERSION'), imageVersion(daggerConst('nodeImage'))],
    'Node image': [
        daggerConst('nodeImage'),
        composeImage('nx-cache'),
        composeImage('dagger-nx-cache'),
        read('demos/local-ingress/run', /^image='(?<value>.+)'$/mv, 'image'),
    ],
    pnpm: [dockerArg('PNPM_VERSION'), daggerConst('pnpmVersion')],
    'Go image': [dockerArg('GO_IMAGE'), daggerConst('goImage')],
    'golangci-lint': [dockerArg('GOLANGCI_LINT_VERSION'), daggerConst('golangciLintVersion')],
    'Rust image': [dockerArg('RUST_IMAGE'), daggerConst('rustImage')],
    'Rust minor': [
        majorMinor(imageVersion(daggerConst('rustImage'))),
        read('Cargo.toml', /^rust-version = "(?<value>.+)"$/mv, 'rust-version'),
    ],
    'cargo-llvm-cov': [dockerArg('CARGO_LLVM_COV_VERSION'), daggerConst('cargoLlvmCovVersion')],
    'wasm-bindgen': [
        dockerArg('WASM_BINDGEN_VERSION'),
        daggerConst('wasmBindgenVersion'),
        read(
            'Cargo.lock',
            /^version = "(?<value>.+)"$/mv,
            'wasm-bindgen',
            '\nname = "wasm-bindgen"\n'
        ),
    ],
    'OpenTofu image': [dockerArg('TOFU_IMAGE'), daggerConst('tofuImage')],
    Dagger: [
        dockerArg('DAGGER_VERSION'),
        mapped(
            read('dagger/dagger.json', /"engineVersion": "(?<value>.+)"/v, 'engineVersion'),
            version => version.replace(/^v/v, '')
        ),
        workflowEnv('DAGGER_VERSION'),
    ],
    Debian: [
        mapped(dockerArg('BASE_IMAGE'), image =>
            debianCodenames.get(/debian(?<release>\d+)$/v.exec(image)?.groups?.release)
        ),
        mapped(daggerConst('debianImage'), image => imageTag(image).split('-', 1)[0]),
        imageVariant(daggerConst('nodeImage')),
        imageVariant(daggerConst('goImage')),
        imageVariant(daggerConst('rustImage')),
    ],
    Playwright: [
        dockerArg('PLAYWRIGHT_VERSION'),
        daggerConst('playwrightVersion'),
        imageVersion(daggerConst('playwrightImage')),
        read('pnpm-workspace.yaml', /^ {2}playwright: (?<value>.+)$/mv, 'playwright'),
    ],
    'Valkey image': [composeImage('valkey'), daggerConst('valkeyImage')],
    'Postgres image': [composeImage('postgres'), daggerConst('postgresImage')],
    'Postgres major': [
        dockerArg('POSTGRES_MAJOR'),
        daggerConst('postgresMajor'),
        major(imageVersion(daggerConst('postgresImage'))),
    ],
    'Cache max age': [
        workflowEnv('NX_CACHE_MAX_AGE_DAYS'),
        wranglerVar('maxAgeDays'),
        read(
            'infra/nx-cache/tofu/variables.tf',
            /^ {2}default += (?<value>.+)$/mv,
            'max_age_days',
            '\nvariable "max_age_days" {\n'
        ),
    ],
    'Cache refresh age': [
        workflowEnv('NX_CACHE_REFRESH_AFTER_DAYS'),
        wranglerVar('refreshAfterDays'),
    ],
});

const failures = () =>
    Object.entries(checks())
        .filter(([, sources]) => {
            const values = new Set(sources.map(({ value }) => value));
            return values.size > 1 || values.has(undefined);
        })
        .map(([name, sources]) =>
            [
                `${name} differs:`,
                ...sources.map(({ label, value }) => `  ${label}: ${value ?? 'not found'}`),
            ].join('\n')
        );

// The source Dagger tests leaves these directories out (`New` in `dagger/main.go`), so inside it there is nothing to
// compare. The `test` job in CI runs this script from the checkout first, where they do exist.
const isInDagger =
    process.env.CI !== undefined && !existsSync(path.join(workspaceRoot, '.devcontainer'));

if (isInDagger) {
    console.log('Skipped: the devcontainer is not part of the source Dagger tests');
} else {
    const found = failures();
    if (found.length > 0) {
        console.error(found.join('\n'));
        process.exitCode = 1;
    }
}
