// Infers the targets of a Rust crate from its `Cargo.toml`, and its dependencies on other crates of the workspace, for
// Nx, as `@naxodev/gonx` does for Go. How each target runs, and when, is in `nx.json`'s target defaults.
//
// Exists because no maintained plugin supports this repo's Nx. Replace it with one that does.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

export const name = 'leyman-rust';

const packageSection = /^\[package\]$(?<section>[^\[]*)/mv;
const packageName = /^name\s*=\s*"(?<name>[^"]+)"/mv;

const runCommands = options => ({
    executor: 'nx:run-commands',
    options: { color: true, cwd: '{projectRoot}', ...options },
});

/**
 * Name of a crate.
 *
 * @param manifest - content of a `Cargo.toml`
 * @returns the name, none for the manifest of a workspace
 */
const crateName = manifest => {
    const section = packageSection.exec(manifest)?.groups.section;
    return section && packageName.exec(section)?.groups.name;
};

/**
 * Lints a crate, for every platform it compiles to.
 *
 * @param crate - for cargo's `--package`
 * @param isWebAssembly - whether it also compiles to WebAssembly
 * @returns how Nx runs it
 */
const clippyTarget = (crate, isWebAssembly) =>
    runCommands({
        commands: [
            `cargo clippy --locked --package ${crate} --all-targets -- -D warnings`,
            ...(isWebAssembly
                ? [
                      `cargo clippy --locked --package ${crate} --lib --target wasm32-unknown-unknown -- -D warnings`,
                  ]
                : []),
        ],
        parallel: false,
    });

/**
 * Tests a crate, writing its coverage to `coverage/llvm-cov.json`.
 *
 * @param crate - for cargo's `--package`
 * @returns how Nx runs it
 */
const testTarget = crate =>
    runCommands({
        commands: [
            'mkdir -p ./coverage',
            // One directory per crate, as cargo-llvm-cov clears the directory it runs in
            `CARGO_LLVM_COV_TARGET_DIR="$NX_WORKSPACE_ROOT/target/llvm-cov/${crate}" cargo llvm-cov --locked --package ${crate} --json --summary-only --output-path ./coverage/llvm-cov.json`,
        ],
        parallel: false,
    });

/**
 * Builds a crate to WebAssembly, and its bindings to JavaScript, in `dist`.
 *
 * @param crate - for cargo's `--package`
 * @returns how Nx runs it
 */
const webAssemblyTarget = crate =>
    runCommands({
        commands: [
            'rm -rf ./dist',
            // Panic messages name standard library files, under the sysroot when the `rust-src` component is installed, and
            // otherwise as `/rustc/<commit>`. Always the latter, for the same bytes wherever this builds
            `RUSTFLAGS="--remap-path-prefix=$(rustc --print sysroot)/lib/rustlib/src/rust=/rustc/$(rustc -vV | sed -n 's/commit-hash: //p')" cargo build --locked --release --target wasm32-unknown-unknown --package ${crate}`,
            `wasm-bindgen --target web --out-dir ./dist "$NX_WORKSPACE_ROOT/target/wasm32-unknown-unknown/release/${crate.replaceAll('-', '_')}.wasm"`,
        ],
        parallel: false,
    });

/**
 * Nodes of one manifest.
 *
 * @param workspaceRoot - directory of the root `Cargo.toml`
 * @param manifestPath - path of a `Cargo.toml`, from the root
 * @returns its project's targets, in the shape `createNodesV2` expects, none for the manifest of a workspace
 */
const manifestNodes = (workspaceRoot, manifestPath) => {
    const root = path.dirname(manifestPath);
    const manifest = readFileSync(path.join(workspaceRoot, manifestPath), 'utf8');
    const crate = crateName(manifest);
    if (!crate) {
        return [];
    }
    const isWebAssembly = manifest.includes('wasm-bindgen');
    const hasTests = existsSync(path.join(workspaceRoot, root, 'tests'));
    const targets = {
        'rust-clippy': clippyTarget(crate, isWebAssembly),
        ...(hasTests && { 'rust-test': testTarget(crate) }),
        ...(isWebAssembly && { 'rust-wasm': webAssemblyTarget(crate) }),
    };
    return [[manifestPath, { projects: { [root]: { targets } } }]];
};

// eslint-disable-next-line unicorn/no-non-function-verb-prefix -- Nx looks a plugin's `createNodesV2` up by this name
export const createNodesV2 = [
    '**/Cargo.toml',
    (manifestPaths, _options, { workspaceRoot }) =>
        manifestPaths.flatMap(manifestPath => manifestNodes(workspaceRoot, manifestPath)),
];

/**
 * The crates of the workspace, without resolving or downloading any other.
 *
 * None with no Rust toolchain, such as a devcontainer not yet rebuilt: only Rust's targets need these dependencies, and
 * they can't run without one anyway.
 *
 * @param workspaceRoot - directory of the root `Cargo.toml`
 * @returns what `cargo metadata` lists for each crate
 * @rejects {Error} when `cargo metadata` fails
 */
const workspaceCrates = async workspaceRoot => {
    try {
        const { stdout } = await promisify(execFile)(
            'cargo',
            ['metadata', '--format-version', '1', '--no-deps', '--offline'],
            { cwd: workspaceRoot }
        );
        return JSON.parse(stdout).packages;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

export const createDependencies = async (_options, { workspaceRoot, projects }) => {
    const projectAt = new Map(
        Object.entries(projects).map(([project, { root }]) => [
            path.resolve(workspaceRoot, root),
            project,
        ])
    );
    const crates = await workspaceCrates(workspaceRoot);
    return crates.flatMap(({ manifest_path: manifestPath, dependencies }) =>
        dependencies
            .filter(dependency => projectAt.has(dependency.path))
            .map(dependency => ({
                source: projectAt.get(path.dirname(manifestPath)),
                target: projectAt.get(dependency.path),
                sourceFile: path.relative(workspaceRoot, manifestPath),
                type: 'static',
            }))
    );
};
