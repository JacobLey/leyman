import { execFile } from 'node:child_process';
import { chmod, realpath } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createFixture } from '../lib/fixture.js';

const execFileAsync = promisify(execFile);

const bin = Path.resolve('bin.mjs');
// TypeScript 7.1's compiler, the package's own devDependency
const tsc = Path.resolve('node_modules/.bin/tsc');

const run = async (
    command: string,
    args: readonly string[],
    cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> => {
    try {
        const { stdout, stderr } = await execFileAsync(command, args, { cwd });
        return { code: 0, stdout, stderr };
    } catch (error) {
        const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
        return { code, stdout, stderr };
    }
};

const tsconfig = (mapper: string): object => ({
    compilerOptions: { strict: true, noEmit: true, module: 'nodenext', target: 'esnext' },
    contentMappers: [{ package: mapper, extensions: ['.schema.yaml'] }],
    include: ['*.ts'],
});

const index = (id: string): string =>
    [
        "import type { Schema } from './user.schema.yaml';",
        '',
        `export const user: Schema = { id: ${id} };`,
        '',
    ].join('\n');

const withProject = beforeEach(createFixture).beforeEach(async ({ fixture }) => {
    await fixture.link(
        Path.resolve('node_modules/@typescript/native'),
        'node_modules/@typescript/native'
    );
    await fixture.link(
        Path.resolve('node_modules/genever-content-mapper'),
        'node_modules/genever-content-mapper'
    );
    await fixture.write({
        'package.json': {
            type: 'module',
            devDependencies: { '@typescript/native': '*' },
            trustedContentMappers: ['genever-content-mapper'],
        },
        'tsconfig.json': tsconfig('genever-content-mapper'),
        'user.schema.yaml': 'type: object\nrequired: [id]\nproperties:\n  id: { type: string }\n',
        'index.ts': index("'a'"),
    });
});
withProject.afterEach(async ({ fixture }) => {
    await fixture.tmpDir.cleanup();
});

suite('trusted-tsc', () => {
    withProject.test('type checks with a trusted content mapper', async ({ fixture }) => {
        expect(await run(bin, ['--pretty', 'false'], fixture.tmpDir.path)).to.deep.equal({
            code: 0,
            stdout: '',
            stderr: '',
        });

        await fixture.write({ 'index.ts': index('1') });
        expect(await run(bin, ['--pretty', 'false'], fixture.tmpDir.path)).to.deep.equal({
            code: 2,
            stdout: "index.ts(3,31): error TS2322: Type 'number' is not assignable to type 'string'.\n",
            stderr: '',
        });
    });

    withProject.test('--check reports the mappers without running tsc', async ({ fixture }) => {
        await fixture.write({ 'index.ts': index('1') });

        expect(await run(bin, ['--check'], fixture.tmpDir.path)).to.deep.equal({
            code: 0,
            stdout: [
                'genever-content-mapper@0.0.1: trusted, sandboxed',
                `1 content mappers in ${fixture.path('tsconfig.json')}`,
                '',
            ].join('\n'),
            stderr: '',
        });
    });

    withProject.test(
        'refuses a mapper that is not trusted, without running tsc',
        async ({ fixture }) => {
            await fixture.write({
                'package.json': { type: 'module', devDependencies: { '@typescript/native': '*' } },
            });

            expect(await run(bin, [], fixture.tmpDir.path)).to.deep.equal({
                code: 1,
                stdout: '',
                stderr: `trusted-tsc: Content mapper 'genever-content-mapper' isn't trusted: add it to trustedContentMappers in the package.json of ${fixture.tmpDir.path}.\n`,
            });
        }
    );

    withProject.test('a mapper can only read its own packages', async ({ fixture }) => {
        await fixture.write({
            'reader/package.json': {
                name: 'reader-mapper',
                version: '1.0.0',
                type: 'module',
                dependencies: { 'genever-content-mapper': '*' },
                typescript: { contentMapper: { exec: ['node', 'bin.mjs'] } },
            },
            // Serves only if it can't read the project's package.json
            'reader/bin.mjs': [
                "import { readFileSync } from 'node:fs';",
                "import { serve } from 'genever-content-mapper';",
                '',
                'try {',
                "    readFileSync(new URL('../package.json', import.meta.url));",
                '    process.exit(1);',
                '} catch {}',
                '',
                'export default serve(process.stdin, process.stdout);',
                '',
            ].join('\n'),
            'package.json': {
                type: 'module',
                devDependencies: { '@typescript/native': '*' },
                trustedContentMappers: ['reader-mapper'],
            },
            'tsconfig.json': tsconfig('reader-mapper'),
        });
        await fixture.link('reader', 'node_modules/reader-mapper');

        // Without the sandbox, it reads the project's package.json
        const plain = await run(
            tsc,
            ['--runExternalCode', '--pretty', 'false'],
            fixture.tmpDir.path
        );
        expect(plain.code).to.equal(2);
        expect(plain.stdout).to.contain(
            "error TS18099: The content mapper 'reader-mapper' could not be initialized."
        );

        expect(await run(bin, ['--pretty', 'false'], fixture.tmpDir.path)).to.deep.equal({
            code: 0,
            stdout: '',
            stderr: '',
        });
    });

    withProject.test('runs tsc as it is for a project without mappers', async ({ fixture }) => {
        await fixture.write({
            'tsconfig.json': { compilerOptions: { strict: true, noEmit: true }, include: ['*.ts'] },
            'index.ts': 'export const a: string = 1;\n',
        });

        expect(await run(bin, ['--pretty', 'false'], fixture.tmpDir.path)).to.deep.equal({
            code: 2,
            stdout: "index.ts(1,14): error TS2322: Type 'number' is not assignable to type 'string'.\n",
            stderr: '',
        });
    });

    withProject.test('runs tsc with --runExternalCode and the sandbox', async ({ fixture }) => {
        // A stand-in for TypeScript, whose executable prints what it was given, then exits as told
        const platform = `@typescript/typescript-${process.platform}-${process.arch}`;
        await fixture.write({
            'package.json': {
                devDependencies: { typescript: '*' },
                trustedContentMappers: ['genever-content-mapper'],
            },
            'node_modules/typescript/package.json': { name: 'typescript', version: '7.1.0' },
            [`node_modules/${platform}/package.json`]: {},
            [`node_modules/${platform}/lib/tsc`]: [
                '#!/bin/sh',
                'echo "$@"',
                'echo "$NODE_OPTIONS"',
                'if [ "$1" = signal ]; then kill -9 $$; fi',
                'exit 3',
                '',
            ].join('\n'),
        });
        await chmod(fixture.path(`node_modules/${platform}/lib/tsc`), 0o755);

        const { code, stdout } = await run(bin, ['--noEmit'], fixture.tmpDir.path);
        const [args, nodeOptions] = stdout.split('\n', 2);
        expect(code).to.equal(3);
        expect(args).to.equal('--noEmit --runExternalCode');
        expect(nodeOptions).to.match(/(?:^| )--permission --allow-fs-read="/v);
        expect(nodeOptions).to.contain(
            `--allow-fs-read="${await realpath('node_modules/genever-content-mapper')}"`
        );

        const killed = await run(bin, ['signal'], fixture.tmpDir.path);
        expect(killed.code).to.equal(1);
    });

    withProject.test('fails without TypeScript 7.1', async ({ fixture }) => {
        await fixture.write({
            'package.json': { trustedContentMappers: ['genever-content-mapper'] },
        });

        expect(await run(bin, [], fixture.tmpDir.path)).to.deep.equal({
            code: 1,
            stdout: '',
            stderr: `trusted-tsc: TypeScript 7.1 or later isn't a dependency of the package of ${fixture.tmpDir.path}.\n`,
        });
    });
});
