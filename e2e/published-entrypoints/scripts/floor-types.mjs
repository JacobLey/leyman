// Checks that published packages work for a consumer on the TypeScript floor, 6.0 (`typescript-floor` in the
// catalog), as well as on the newest TypeScript:
//
// 1. Each package's published declarations, with both, as a strict consumer with `skipLibCheck: false` would, limited
//    to the `lib` and `target` of its Node.js floor's `@leyman/configs/tsconfig.node-<major>.json`. Run in the
//    package's own directory, so its floor's `@types/node` resolves. Only errors in its own files, and those about the
//    check itself, are reported, as `check-package` does.
// 2. Each package's type tests (`test/tsconfig.json`) on 6.0. They import the package's built declarations, as a
//    consumer would. The newest TypeScript already checks them in `tsc-test`.
//
// Every check runs, at most `os.availableParallelism()` at once, and it fails at the end printing every error.

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ts from 'typescript-floor';
import { publishedPackages } from './floors.mjs';

const execFileAsync = promisify(execFile);

const nodeModules = path.join(import.meta.dirname, '../node_modules');
const floorTsc = path.join(nodeModules, 'typescript-floor/bin/tsc');
const newest = JSON.parse(
    readFileSync(path.join(nodeModules, '@typescript/native/package.json'), 'utf8')
).version;
const compilers = {
    [`TypeScript ${ts.version}`]: floorTsc,
    [`TypeScript ${newest}`]: path.join(nodeModules, '@typescript/native/bin/tsc'),
};

/**
 * Runs `tsc`, which exits non-zero when it reports errors, with them on stdout.
 *
 * @param tsc - path of `tsc`
 * @param args - arguments
 * @param cwd - directory to run in
 * @returns what `tsc` printed
 * @rejects {Error} when `tsc` couldn't run
 */
const runTsc = async (tsc, args, cwd) => {
    try {
        const { stdout } = await execFileAsync(process.execPath, [tsc, ...args], {
            cwd,
            maxBuffer: Number.POSITIVE_INFINITY,
        });
        return stdout;
    } catch (error) {
        if (typeof error.stdout !== 'string') {
            throw error;
        }
        return error.stdout || String(error);
    }
};

/**
 * The `lib` and `target` a Node.js floor's tsconfig allows, as `tsc` arguments.
 *
 * @param major - the floor's major version
 * @returns `--lib` and `--target` with their values
 * @throws {Error} when the tsconfig doesn't set both
 */
const floorOptions = major => {
    const file = path.join(nodeModules, `@leyman/configs/tsconfig.node-${major}.json`);
    const { config, error } = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));
    const { lib, target } = config?.compilerOptions ?? {};
    if (error || typeof target !== 'string' || !Array.isArray(lib)) {
        throw new Error(`${file} doesn't set compilerOptions.lib and compilerOptions.target`);
    }
    return ['--lib', lib.join(',').toLowerCase(), '--target', target.toLowerCase()];
};

/**
 * The declaration files a package publishes: those in its copy here, which holds exactly the files it publishes.
 *
 * @param name - the package
 * @returns their paths, relative to the package
 */
const publishedDeclarations = name =>
    readdirSync(path.join(nodeModules, name), { recursive: true, encoding: 'utf8' })
        .filter(file => /\.d\.[cm]?ts$/v.test(file) && !file.startsWith('node_modules'))
        .map(file => file.replaceAll(path.sep, '/'))
        .toSorted((a, b) => a.localeCompare(b));

const checks = [];
for (const pkg of publishedPackages()) {
    const declarations = publishedDeclarations(pkg.name);
    if (declarations.length > 0) {
        if (pkg.floor === null) {
            throw new Error(`${pkg.name} publishes declarations but has no engines.node floor`);
        }
        const options = floorOptions(pkg.floor.split('.', 1)[0]);
        const own = new Set(declarations);
        for (const [compiler, tsc] of Object.entries(compilers)) {
            checks.push({
                name: `${pkg.name}: declarations on ${compiler}`,
                run: async () => {
                    const output = await runTsc(
                        tsc,
                        [
                            '--ignoreConfig',
                            '--noEmit',
                            '--pretty',
                            'false',
                            '--strict',
                            '--skipLibCheck',
                            'false',
                            '--module',
                            'nodenext',
                            ...options,
                            '--types',
                            'node',
                            ...declarations,
                        ],
                        pkg.path
                    );
                    // Each diagnostic is `<file>(<line>,<column>): error ...`, or `error ...` when it is about the
                    // check itself, followed by indented detail
                    return output
                        .split('\n')
                        .filter(
                            line =>
                                line.startsWith('error ') ||
                                own.has(line.slice(0, line.indexOf('(')))
                        );
                },
            });
        }
    }
    if (existsSync(path.join(pkg.path, 'test/tsconfig.json'))) {
        checks.push({
            name: `${pkg.name}: type tests on TypeScript ${ts.version}`,
            run: async () => {
                const output = await runTsc(
                    floorTsc,
                    ['-p', 'test', '--noEmit', '--pretty', 'false'],
                    pkg.path
                );
                return output.split('\n').filter(line => line.trim() !== '');
            },
        });
    }
}

const failures = [];
const queue = checks.values();
const worker = async () => {
    for (const { name, run } of queue) {
        const errors = await run();
        console.log(`${errors.length === 0 ? 'Passed' : 'Failed'}: ${name}`);
        if (errors.length > 0) {
            failures.push({ name, errors });
        }
    }
};
const workers = Math.min(availableParallelism(), checks.length);
await Promise.all(Array.from({ length: workers }, worker));

if (failures.length > 0) {
    const sorted = failures.toSorted((a, b) => a.name.localeCompare(b.name));
    for (const { name, errors } of sorted) {
        console.error(`\n${name}:`);
        for (const line of errors) {
            console.error(`  ${line}`);
        }
    }
    process.exitCode = 1;
}
