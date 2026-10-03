import type { Chain, ChainHook, ChainTest } from 'test-chain-core';
import type { FakeKey } from '../../fixtures/fake-framework.js';
import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import { createChain, HookOrderError } from 'test-chain-core';
import { createFakeFramework } from '../../fixtures/fake-framework.js';

const hookOf = (chain: Chain, name: string): ChainHook => chain[name] as ChainHook;
const testOf = (chain: Chain, name: string): ChainTest => chain[name] as ChainTest;

suite('createChain', () => {
    suite('Entrypoints', () => {
        test('Register with native methods', () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            chain.before('before', () => {});
            chain.before(() => {});
            chain.beforeEach('beforeEach', () => {});
            chain.test('test', () => {});
            chain.test.only('test.only', () => {});
            chain.test.skip('test.skip', () => {});
            chain.afterEach('afterEach', () => {});
            chain.after('after', () => {});

            expect(
                fake.registrations.map(({ method, title }) => ({ method, title }))
            ).to.deep.equal([
                { method: 'before', title: 'before' },
                { method: 'before', title: undefined },
                { method: 'beforeEach', title: 'beforeEach' },
                { method: 'test', title: 'test' },
                { method: 'test.only', title: 'test.only' },
                { method: 'test.skip', title: 'test.skip' },
                { method: 'afterEach', title: 'afterEach' },
                { method: 'after', title: 'after' },
            ]);
        });

        test('Callbacks do not receive context', async () => {
            const fake = createFakeFramework({ supportsDone: false });
            const chain = createChain(fake.framework);

            const seen: unknown[] = [];
            chain.test('test', function (this: unknown, ...args: unknown[]) {
                seen.push(this, args);
            });
            const key: FakeKey = { name: '<key>' };
            await fake.run('test', key, '<arg>');

            expect(seen).to.deep.equal([{ currentTest: key, test: key }, ['<arg>']]);
        });

        test('Test registration returns framework value', () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            expect(chain.test('test', () => {})).to.equal(fake.find('test'));
        });
    });

    suite('before', () => {
        test('Propagates context to chained hooks and tests', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            const seen: Record<string, unknown> = {};

            const root = chain.before('root', () => ({ a: 1 }));
            expect(Object.keys(root).toSorted((a, b) => a.localeCompare(b))).to.deep.equal([
                'after',
                'afterAll',
                'afterEach',
                'before',
                'beforeAll',
                'beforeEach',
                'it',
                'test',
                'xit',
            ]);
            expect(root.before).to.equal(root.beforeAll);
            expect(root.after).to.equal(root.afterAll);
            expect(root.test).to.equal(root.it);
            expect(root.xit).to.equal(testOf(root, 'test').skip);

            const second = hookOf(root, 'before')('second', (ctx: object) => {
                seen.second = ctx;
                return { b: 2 };
            });
            hookOf(second, 'beforeEach')('beforeEach', (ctx: object) => {
                seen.beforeEach = ctx;
            });
            testOf(second, 'test')('test', (ctx: object) => {
                seen.test = ctx;
            });
            testOf(second, 'test').only('test.only', () => {});
            testOf(second, 'xit')('xit', () => {});
            hookOf(second, 'afterEach')('afterEach', (ctx: object) => {
                seen.afterEach = ctx;
            });
            const after = hookOf(second, 'after')('after', (ctx: object) => {
                seen.after = ctx;
                return { c: 3 };
            });
            hookOf(after, 'after')('lastAfter', (ctx: object) => {
                seen.lastAfter = ctx;
            });

            for (const title of [
                'root',
                'second',
                'beforeEach',
                'test',
                'afterEach',
                'after',
                'lastAfter',
            ]) {
                await fake.run(title);
            }

            expect(seen).to.deep.equal({
                second: { a: 1 },
                beforeEach: { a: 1, b: 2 },
                test: { a: 1, b: 2 },
                afterEach: { a: 1, b: 2 },
                after: { a: 1, b: 2 },
                lastAfter: { a: 1, b: 2, c: 3 },
            });
            expect(fake.find('test.only').method).to.equal('test.only');
            expect(fake.find('xit').method).to.equal('test.skip');
        });

        test('Ignores falsy context, and copies context per hook', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            let seen: unknown;

            const root = chain.before('root', () => ({ a: 1 }));
            const second = hookOf(root, 'before')('second', (ctx: { a: number }) => {
                ctx.a = 99;
                return null;
            });
            testOf(second, 'test')('test', (ctx: object) => {
                seen = ctx;
            });

            for (const title of ['root', 'second', 'test']) {
                await fake.run(title);
            }

            expect(seen).to.deep.equal({ a: 1 });
        });
    });

    suite('beforeEach', () => {
        test('Context is isolated per test', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            const seen: Record<string, unknown[]> = { test: [], afterEach: [], lastAfterEach: [] };

            let count = 0;
            const root = chain.beforeEach('root', () => {
                count++;
                return { count };
            });
            expect(Object.keys(root).toSorted((a, b) => a.localeCompare(b))).to.deep.equal([
                'afterEach',
                'beforeEach',
                'it',
                'test',
                'xit',
            ]);

            const nested = hookOf(root, 'beforeEach')('nested', (ctx: { count: number }) => ({
                double: ctx.count * 2,
            }));
            testOf(nested, 'test')('test', (ctx: object) => {
                seen.test!.push(ctx);
            });
            testOf(nested, 'test').skip('test.skip', () => {});
            const afterEach = hookOf(nested, 'afterEach')('afterEach', (ctx: object) => {
                seen.afterEach!.push(ctx);
                return { after: true };
            });
            hookOf(afterEach, 'afterEach')('lastAfterEach', (ctx: object) => {
                seen.lastAfterEach!.push(ctx);
            });

            const first: FakeKey = { name: 'first' };
            const second: FakeKey = { name: 'second' };
            // Interleave tests, to ensure context is looked up by test
            await fake.run('root', first);
            await fake.run('root', second);
            await fake.run('nested', second);
            await fake.run('nested', first);
            await fake.run('test', first);
            await fake.run('test', second);
            await fake.run('afterEach', second);
            await fake.run('afterEach', first);
            await fake.run('lastAfterEach', first);
            await fake.run('lastAfterEach', second);

            expect(seen).to.deep.equal({
                test: [
                    { count: 1, double: 2 },
                    { count: 2, double: 4 },
                ],
                afterEach: [
                    { count: 2, double: 4 },
                    { count: 1, double: 2 },
                ],
                lastAfterEach: [
                    { count: 1, double: 2, after: true },
                    { count: 2, double: 4, after: true },
                ],
            });
            expect(fake.find('test.skip').method).to.equal('test.skip');
        });
    });

    suite('afterEach', () => {
        test('Propagates context to chained afterEach', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            let seen: unknown;

            const root = chain.afterEach('root', () => ({ a: 1 }));
            expect(Object.keys(root)).to.deep.equal(['afterEach']);
            hookOf(root, 'afterEach')('second', (ctx: object) => {
                seen = ctx;
            });

            await fake.run('root');
            await fake.run('second');

            expect(seen).to.deep.equal({ a: 1 });
        });
    });

    suite('after', () => {
        test('Propagates context to chained after', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            let seen: unknown;

            const root = chain.after('root', () => ({ a: 1 }));
            expect(Object.keys(root).toSorted((a, b) => a.localeCompare(b))).to.deep.equal([
                'after',
                'afterAll',
            ]);
            hookOf(root, 'after')('second', (ctx: object) => {
                seen = ctx;
            });

            await fake.run('root');
            await fake.run('second');

            expect(seen).to.deep.equal({ a: 1 });
        });
    });

    suite('Failures', () => {
        test('Failed one-time hook propagates existing context', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            const error = new Error('<ERROR>');
            let seen: unknown;

            const root = chain.before('root', () => ({ a: 1 }));
            const failing = hookOf(root, 'before')('failing', () => {
                throw error;
            });
            hookOf(failing, 'after')('after', (ctx: object) => {
                seen = ctx;
            });

            await fake.run('root');
            const thrown: unknown = await expect(fake.run('failing')).to.be.rejectedWith(Error);
            expect(thrown).to.equal(error);
            await fake.run('after');

            expect(seen).to.deep.equal({ a: 1 });
        });

        test('Failed per-test hook propagates existing context', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            const error = new Error('<ERROR>');
            let seen: unknown;

            const root = chain.beforeEach('root', () => ({ a: 1 }));
            const failing = hookOf(root, 'beforeEach')('failing', () => {
                throw error;
            });
            hookOf(failing, 'afterEach')('afterEach', (ctx: object) => {
                seen = ctx;
            });

            await fake.run('root');
            const thrown: unknown = await expect(fake.run('failing')).to.be.rejectedWith(Error);
            expect(thrown).to.equal(error);
            await fake.run('afterEach');

            expect(seen).to.deep.equal({ a: 1 });
        });

        test('One-time hook executed out of order', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            const root = chain.before('root', () => ({ a: 1 }));
            hookOf(root, 'before')('second', () => {});

            await expect(fake.run('second')).to.be.rejectedWith(HookOrderError);
        });

        test('Per-test hook executed out of order', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            const root = chain.beforeEach('root', () => ({ a: 1 }));
            hookOf(root, 'afterEach')('afterEach', () => {});

            await fake.run('root', { name: 'other' });
            await expect(fake.run('afterEach')).to.be.rejectedWith(HookOrderError);
        });
    });
});
