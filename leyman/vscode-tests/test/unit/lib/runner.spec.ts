import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { buildCommand, failureLocation, runProcess, titlePattern } from '#runner';

const mocha = { name: 'a', root: '/a', runner: 'mocha' } as const;
const vitest = { name: 'a', root: '/a', runner: 'vitest' } as const;

suite('runner', () => {
    suite('titlePattern', () => {
        test('Anchors a test, and a suite up to what follows it', () => {
            expect(
                titlePattern('mocha', [
                    { kind: 'test', titles: ['a', 'b'] },
                    { kind: 'suite', titles: ['c'] },
                ])
            ).to.equal('^(?:a b$|c )');
        });

        test('Vitest has its own separator', () => {
            expect(
                titlePattern('vitest', [
                    { kind: 'test', titles: ['a', 'b'] },
                    { kind: 'suite', titles: ['c'] },
                ])
            ).to.equal('^(?:a > b$|c > )');
        });

        test('Escapes titles', () => {
            expect(titlePattern('mocha', [{ kind: 'test', titles: ['a.b (c)'] }])).to.equal(
                String.raw`^(?:a\.b \(c\)$)`
            );
        });
    });

    suite('buildCommand', () => {
        const base = { workspace: '/w', selections: [], report: '/r.json', isDebug: false };

        test('Mocha runs the compiled spec', () => {
            expect(
                buildCommand({ ...base, project: mocha, spec: '/a/test/unit/b.spec.ts' })
            ).to.deep.equal({
                program: '/a/node_modules/mocha/bin/mocha.js',
                args: [
                    'dist-test/unit/b.spec.js',
                    '--timeout',
                    '2000',
                    '--reporter',
                    'json',
                    '--reporter-option',
                    'output=/r.json',
                ],
                cwd: '/a',
                report: '/r.json',
            });
        });

        test('Mocha allows integration tests longer, and a debugger forever', () => {
            const spec = '/a/test/integration/b.spec.ts';
            expect(buildCommand({ ...base, project: mocha, spec }).args[2]).to.equal('10000');
            expect(buildCommand({ ...base, project: mocha, spec, isDebug: true }).args[2]).to.equal(
                '0'
            );
        });

        test('Selections become a pattern', () => {
            const { args } = buildCommand({
                ...base,
                project: mocha,
                spec: '/a/test/unit/b.spec.ts',
                selections: [{ kind: 'test', titles: ['c'] }],
            });
            expect(args.slice(-2)).to.deep.equal(['--grep', '^(?:c$)']);
        });

        test('Vitest uses the shared config', () => {
            expect(
                buildCommand({
                    ...base,
                    project: vitest,
                    spec: '/a/test/unit/b.spec.ts',
                    selections: [{ kind: 'test', titles: ['c'] }],
                    isDebug: true,
                })
            ).to.deep.equal({
                program: '/a/node_modules/vitest/vitest.mjs',
                args: [
                    'run',
                    '--config',
                    '/w/configs/vitest.config.js',
                    '--root',
                    '.',
                    '--reporter',
                    'json',
                    '--outputFile',
                    '/r.json',
                    '--testNamePattern',
                    '^(?:c$)',
                    '--testTimeout',
                    '0',
                    'dist-test/unit/b.spec.js',
                ],
                cwd: '/a',
                report: '/r.json',
            });
        });

        test('Vitest runs everything without selections', () => {
            const { args } = buildCommand({
                ...base,
                project: vitest,
                spec: '/a/test/unit/b.spec.ts',
            });
            expect(args).to.not.include('--testNamePattern');
            expect(args).to.not.include('--testTimeout');
        });
    });

    suite('runProcess', () => {
        const { signal } = new AbortController();
        const options = {
            signal,
            cwd: import.meta.dirname,
            // eslint-disable-next-line n/no-process-env -- The process runs as the test does
            env: process.env,
        };

        test('Reports output and exit code', async () => {
            const output: string[] = [];
            const code = await runProcess({
                ...options,
                command: process.execPath,
                args: ['-e', 'console.log("out"); console.error("err"); process.exit(3);'],
                onOutput: text => {
                    output.push(text);
                },
            });
            expect(code).to.equal(3);
            expect(output).to.have.members(['err\n', 'out\n']);
        });

        test('A missing program is output, and not a success', async () => {
            const output: string[] = [];
            const code = await runProcess({
                ...options,
                command: 'this-does-not-exist',
                args: [],
                onOutput: text => {
                    output.push(text);
                },
            });
            expect(code).to.not.equal(0);
            expect(output.join('')).to.include('ENOENT');
        });

        test('Aborting stops the process, quietly', async () => {
            const abort = new AbortController();
            const output: string[] = [];
            const running = runProcess({
                ...options,
                command: process.execPath,
                args: ['-e', 'setTimeout(() => {}, 60_000); console.log("ready");'],
                signal: abort.signal,
                onOutput: text => {
                    output.push(text);
                    abort.abort();
                },
            });
            expect(await running).to.equal(null);
            expect(output).to.deep.equal(['ready\n']);
        });
    });

    suite('failureLocation', () => {
        test('First frame in a spec, zero-based', () => {
            expect(
                failureLocation(`Error: a
    at helper (/a/src/lib.ts:1:1)
    at Context.<anonymous> (file:///a/test/unit/b.spec.ts:10:5)
    at /a/test/unit/c.spec.ts:20:5`)
            ).to.deep.equal({ path: '/a/test/unit/b.spec.ts', line: 9, character: 4 });
        });

        test('Nothing without such a frame', () => {
            expect(failureLocation('Error: a\n    at /a/src/lib.ts:1:1')).to.equal(undefined);
            expect(failureLocation()).to.equal(undefined);
        });
    });
});
