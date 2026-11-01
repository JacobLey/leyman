import { writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { activate } from '@leyman/vscode-tests';
import { suite, test } from 'mocha-chain';
import { FakeToken, fakeVscode } from '../helpers/fake-vscode.js';
import { withWorkspace } from '../helpers/workspace.js';

const VITEST_COMPILED = `import { describe, expect, it } from 'vitest';

describe('outer', () => {
    it('passes', () => {});
    it('fails', () => {
        expect(1).to.equal(2);
    });
    it.skip('is skipped', () => {});
    it('passes too', () => {});
});
`;

const VITEST_SOURCE = `import { suite, test } from 'vitest-chain';

suite('outer', () => {
    test('passes', () => {});
    test('fails', () => {});
    test.skip('is skipped', () => {});
    test('passes too', () => {});
});
`;

const start = async (root: string | undefined, specs: readonly string[] = []) => {
    const fake = fakeVscode(root, specs);
    const context = { subscriptions: [] };
    const controller = await activate(context, fake.vscode);
    return { ...fake, context, activated: controller };
};

type Started = Awaited<ReturnType<typeof start>>;

const resolved = async ({ controller, items }: Started, project: string, spec: string) => {
    const file = items.get(project)?.children.get(spec);
    await controller.resolveHandler?.(file);
    if (!file) {
        throw new Error(`No ${spec}`);
    }
    return file;
};

const runRequest = async (
    { profiles, runs }: Started,
    include: unknown,
    { profile = 'Run', exclude = [] }: { profile?: string; exclude?: unknown[] } = {}
) => {
    await profiles.get(profile)?.({ include, exclude }, new FakeToken());
    const run = runs.at(-1);
    if (!run) {
        throw new Error('No run');
    }
    return run;
};

suite('activate', () => {
    test('Does nothing without a workspace', async () => {
        const { activated, context } = await start(undefined);
        expect(activated).to.equal(undefined);
        expect(context.subscriptions).to.deep.equal([]);
    });

    const withFixture = withWorkspace();

    suite('Discovery', () => {
        withFixture.test('Lists specs per project, and parses on demand', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root, [spec]);

            const project = started.items.get(root);
            expect(project?.label).to.equal('a');
            const file = project?.children.get(spec);
            expect(file?.label).to.equal('unit/sample.spec.ts');
            expect(file?.canResolveChildren).to.equal(true);
            expect(file?.children.size).to.equal(0);

            await started.controller.resolveHandler?.(file);
            expect(file?.canResolveChildren).to.equal(false);
            expect(file?.tree()).to.deep.equal([
                'outer',
                'outer/passes',
                'outer/fails',
                'outer/fails with diff',
                'outer/is skipped',
                'outer/passes too',
                'outer/inner',
                'outer/inner/nested',
            ]);
            expect(file?.find(['outer', 'passes']).range).to.deep.equal({
                start: { line: 5, character: 4 },
                end: { line: 5, character: 38 },
            });
        });

        withFixture.test('Refreshing the whole tree does nothing', async ({ workspace }) => {
            const started = await start(workspace.root);
            await started.controller.resolveHandler?.();
            expect(started.items.size).to.equal(0);
        });

        withFixture.test('Ignores a spec outside a project', async ({ workspace }) => {
            const started = await start(workspace.root, [
                Path.join(workspace.root, 'test/a.spec.ts'),
            ]);
            expect(started.items.size).to.equal(0);
            await started.onCreate.fire(started.file(Path.join(workspace.root, 'test/a.spec.ts')));
            expect(started.items.size).to.equal(0);
        });

        withFixture.test('Parses documents already open', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const fake = fakeVscode(workspace.root, [spec]);
            fake.textDocuments.push(
                fake.document(spec, `test('from editor', () => {});`),
                fake.document(spec, `test('other scheme', () => {});`, 'git'),
                fake.document(Path.join(root, 'src/a.ts'), `test('not a spec', () => {});`)
            );
            await activate({ subscriptions: [] }, fake.vscode);
            expect(fake.items.get(root)?.children.get(spec)?.tree()).to.deep.equal(['from editor']);
        });

        withFixture.test('Follows edits, opens and the disk', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root);
            const project = () => started.items.get(root);

            await started.onOpen.fire(started.document(spec, `test('opened', () => {});`));
            expect(project()?.children.get(spec)?.tree()).to.deep.equal(['opened']);

            await started.onChangeDocument.fire({
                document: started.document(spec, `test('edited', () => {});`),
            });
            expect(project()?.children.get(spec)?.tree()).to.deep.equal(['edited']);

            await writeFile(spec, `test('on disk', () => {});`);
            await started.onChange.fire(started.file(spec));
            expect(project()?.children.get(spec)?.tree()).to.deep.equal(['on disk']);

            await started.onDelete.fire(started.file(spec));
            expect(started.items.size).to.equal(0);

            await started.onCreate.fire(started.file(spec));
            expect(project()?.children.get(spec)?.tree()).to.deep.equal(['on disk']);

            await started.onCreate.fire(started.file(Path.join(root, 'test/data/ignored.spec.ts')));
            expect(project()?.children.size).to.equal(1);
        });

        withFixture.test('Deleting keeps a project with other specs', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const other = Path.join(root, 'test/unit/other.spec.ts');
            await writeFile(other, '');
            const started = await start(workspace.root, [spec, other]);

            await started.onDelete.fire(started.file(spec));
            expect(started.items.get(root)?.children.size).to.equal(1);

            await started.onDelete.fire(started.file(Path.join(root, 'test/unit/unknown.spec.ts')));
            expect(started.items.get(root)?.children.size).to.equal(1);
        });
    });

    suite('Run', () => {
        withFixture.test('A single chained test', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file.find(['outer', 'passes'])]);

            expect(run.ended).to.equal(true);
            expect(run.results()).to.deep.equal({ passes: 'passed' });
            expect(run.output).to.include('nx run a:test:compile --outputStyle=static\r\n');
        });

        withFixture.test('A suite, reporting everything in it', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file.find(['outer', 'inner'])]);

            expect(run.results()).to.deep.equal({ nested: 'passed' });
        });

        withFixture.test('A whole project, without parsing first', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root, [spec]);

            const run = await runRequest(started, [started.items.get(root)]);

            expect(run.results()).to.deep.equal({
                passes: 'passed',
                'passes too': 'passed',
                nested: 'passed',
                'made at one': 'passed',
                'is skipped': 'skipped',
                fails: 'failed',
                'fails with diff': 'failed',
            });
        });

        withFixture.test('Everything, minus what is excluded', async ({ workspace }) => {
            const a = await workspace.addProject({ name: 'a' });
            const b = await workspace.addProject({ name: 'b' });
            const started = await start(workspace.root, [a.spec, b.spec]);

            await runRequest(started, undefined, {
                exclude: [started.items.get(b.root)],
            });
            const run = started.runs.at(-1);

            expect(run?.output).to.include('a:test:compile');
            expect(run?.output).to.not.include('b:test:compile');
        });

        withFixture.test('Failures have a message, diff and location', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [
                file.find(['outer', 'fails']),
                file.find(['outer', 'fails with diff']),
            ]);

            expect(run.results()).to.deep.equal({ fails: 'failed', 'fails with diff': 'failed' });
            expect(run.message('fails')?.message).to.equal('<FAILS>');
            expect(run.message('fails')?.expectedOutput).to.equal(undefined);
            const diff = run.message('fails with diff');
            expect(diff?.expectedOutput).to.include('"a": 2');
            expect(diff?.actualOutput).to.include('"a": 1');
        });

        withFixture.test('Values a reporter left alone are not a diff', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                source: `test('a', () => {});\n`,
                compiled: `it('a', () => {
                    const error = new Error('<A>');
                    error.expected = 1;
                    error.actual = 2;
                    error.showDiff = false;
                    throw error;
                });`,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file.find(['a'])]);

            expect(run.message('a')?.message).to.equal('<A>');
            expect(run.message('a')?.expectedOutput).to.equal(undefined);
        });

        withFixture.test('Places a failure on its line in the spec', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                source: `test('a', () => {});\n`,
                compiled: String.raw`it('a', () => {
                    const error = new Error('<A>');
                    error.stack = 'Error: <A>\n    at ${Path.join(workspace.root, 'a/test/unit/sample.spec.ts')}:3:7';
                    throw error;
                });`,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file.find(['a'])]);

            expect(run.message('a')?.location?.uri.fsPath).to.equal(spec);
            expect(run.message('a')?.location?.position).to.deep.equal({ line: 2, character: 6 });
        });

        withFixture.test(
            'A title made at runtime appears under its suite',
            async ({ workspace }) => {
                const { root, spec } = await workspace.addProject({ name: 'a' });
                const started = await start(workspace.root, [spec]);
                const file = await resolved(started, root, spec);

                await runRequest(started, [file.find(['outer'])]);

                expect(file.find(['outer', 'made at one']).label).to.equal('made at one');
            }
        );

        withFixture.test(
            'A failing hook appears, and its tests are skipped',
            async ({ workspace }) => {
                const { root, spec } = await workspace.addProject({
                    name: 'a',
                    source: `suite('a', () => { suite('b', () => { test('c', () => {}); }); });`,
                    compiled: `describe('a', () => { describe('b', () => {
                    beforeEach(() => { throw new Error('<HOOK>'); });
                    it('c', () => {});
                }); });`,
                });
                const started = await start(workspace.root, [spec]);
                const file = await resolved(started, root, spec);

                const run = await runRequest(started, [file.find(['a'])]);

                expect(run.results()).to.deep.equal({
                    '"before each" hook for "c"': 'failed',
                    c: 'skipped',
                });
                expect(file.find(['a', 'b', '"before each" hook for "c"']).label).to.not.equal('');
            }
        );

        withFixture.test('A title outside any suite goes on the file', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                source: `suite('a', () => {});`,
                compiled: `describe('a', () => { it('b', () => {}); });
                    it('c', () => {});`,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            await runRequest(started, [file]);

            expect(file.tree()).to.deep.equal(['a', 'a/b', 'c']);
        });

        withFixture.test('A spec that fails to load errors its tests', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                source: `test('a', () => {});`,
                compiled: `this is not javascript`,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file.find(['a'])]);

            expect(run.results()).to.deep.equal({ a: 'errored' });
            expect(run.output).to.include('SyntaxError');
        });

        withFixture.test('A spec of no known tests errors the file', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                source: '',
                compiled: `this is not javascript`,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file]);

            expect(run.results()).to.deep.equal({ 'unit/sample.spec.ts': 'errored' });
        });

        withFixture.test(
            'Compile failure errors the tests, without running',
            async ({ workspace }) => {
                const { root, spec } = await workspace.addProject({ name: 'broken' });
                const started = await start(workspace.root, [spec]);
                const file = await resolved(started, root, spec);

                const run = await runRequest(started, [file.find(['outer', 'passes'])]);

                expect(run.results()).to.deep.equal({ passes: 'errored' });
                expect(run.message('passes')?.message).to.include('broken failed to compile');
            }
        );

        withFixture.test('Runs one at a time, also after a failure', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);
            const handler = started.profiles.get('Run');
            const request = { include: [file.find(['outer', 'passes'])] };

            await Promise.allSettled([
                handler?.({ include: [{}] }, new FakeToken()),
                handler?.(request, new FakeToken()),
                handler?.(request, new FakeToken()),
            ]);

            expect(started.runs.map(run => run.ended)).to.deep.equal([true, true, true]);
            expect(started.runs[1]?.results()).to.deep.equal({ passes: 'passed' });
            expect(started.runs[2]?.results()).to.deep.equal({ passes: 'passed' });
        });
    });

    suite('Vitest', () => {
        withFixture.test('Runs a selected test, and reports all', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                runner: 'vitest',
                source: VITEST_SOURCE,
                compiled: VITEST_COMPILED,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file.find(['outer', 'passes'])]);

            expect(run.results().passes).to.equal('passed');
            expect(run.results()['passes too']).to.equal('skipped');
        });

        withFixture.test('Reports failures', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                runner: 'vitest',
                source: VITEST_SOURCE,
                compiled: VITEST_COMPILED,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file]);

            expect(run.results()).to.deep.equal({
                passes: 'passed',
                fails: 'failed',
                'is skipped': 'skipped',
                'passes too': 'passed',
            });
            expect(run.message('fails')?.message).to.include('expected 1 to equal 2');
        });

        withFixture.test('Reports a spec that fails to load', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                runner: 'vitest',
                source: `test('a', () => {});`,
                compiled: `throw new Error('<LOAD>');`,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file]);

            expect(run.results()).to.deep.equal({ a: 'errored' });
            expect(run.message('a')?.message).to.include('<LOAD>');
        });
    });

    suite('Cancel', () => {
        withFixture.test('During a build, skipping what remains', async ({ workspace }) => {
            const a = await workspace.addProject({ name: 'slow' });
            const b = await workspace.addProject({ name: 'b' });
            const started = await start(workspace.root, [a.spec, b.spec]);
            const fileA = await resolved(started, a.root, a.spec);
            const fileB = await resolved(started, b.root, b.spec);
            const token = new FakeToken();
            started.nextRun.hook = run => {
                run.onOutput = text => {
                    if (text.includes('nx run slow')) {
                        token.cancel();
                    }
                };
            };

            await started.profiles.get('Run')?.(
                { include: [fileA.find(['outer', 'passes']), fileB.find(['outer', 'passes'])] },
                token
            );
            const run = started.runs.at(-1);

            expect(run?.ended).to.equal(true);
            expect(run?.results()).to.deep.equal({ passes: 'skipped' });
            expect(run?.output).to.not.include('b:test:compile');
        });

        withFixture.test('During a test', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({
                name: 'a',
                source: `test('a', () => {});`,
                compiled: `it('a', async () => {
                    console.log('<RUNNING>');
                    await new Promise(resolve => setTimeout(resolve, 60_000));
                }).timeout(0);`,
            });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);
            const token = new FakeToken();
            started.nextRun.hook = run => {
                run.onOutput = text => {
                    if (text.includes('<RUNNING>')) {
                        token.cancel();
                    }
                };
            };

            await started.profiles.get('Run')?.({ include: [file.find(['a'])] }, token);

            expect(started.runs.at(-1)?.results()).to.deep.equal({ a: 'skipped' });
        });
    });

    suite('Debug', () => {
        withFixture.test('Reads results once the session ends', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);

            const run = await runRequest(started, [file.find(['outer', 'passes'])], {
                profile: 'Debug',
            });

            expect(run.results()).to.deep.equal({ passes: 'passed' });
        });

        withFixture.test(
            'A debugger that fails to start errors the test',
            async ({ workspace }) => {
                const { root, spec } = await workspace.addProject({ name: 'a' });
                const started = await start(workspace.root, [spec]);
                const file = await resolved(started, root, spec);
                started.debugState.start = false;

                const run = await runRequest(started, [file.find(['outer', 'passes'])], {
                    profile: 'Debug',
                });

                expect(run.results()).to.deep.equal({ passes: 'errored' });
            }
        );

        withFixture.test('Cancelling stops the session', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const started = await start(workspace.root, [spec]);
            const file = await resolved(started, root, spec);
            const token = new FakeToken();
            started.debugState.onStart = () => {
                token.cancel();
            };

            await started.profiles.get('Debug')?.(
                { include: [file.find(['outer', 'passes'])] },
                token
            );

            expect(started.debugState.stopped).to.equal(1);
            expect(started.runs.at(-1)?.results()).to.deep.equal({ passes: 'skipped' });
        });
    });
});
