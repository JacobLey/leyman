import type { ChainHook } from 'test-chain-core';
import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import { createChain, HookOrderError } from 'test-chain-core';
import { createFakeFramework } from '../../fixtures/fake-framework.js';

const lockMessage = 'Cannot create new hook/suite/test while executing a hook/test';

suite('framework', () => {
    suite('suite', () => {
        test('Invokes native suite', () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            let invoked = false;

            chain.suite('suite', () => {
                invoked = true;
            });
            chain.suite.only('suite.only', () => {});
            chain.suite.skip('suite.skip', () => {});

            expect(invoked).to.equal(true);
            expect(fake.registrations.map(({ method }) => method)).to.deep.equal([
                'suite',
                'suite.only',
                'suite.skip',
            ]);
        });

        test('Binds native this', () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            let invoked = false;

            chain.suite('suite', function (this: unknown) {
                expect(this).to.deep.equal({ suite: 'suite' });
                invoked = true;
            });

            expect(invoked).to.equal(true);
        });

        test('Rejects async callbacks', () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            expect(() => chain.suite('suite', async () => {})).to.throw(
                TypeError,
                'Suite callback must be synchronous'
            );
        });

        test('Allows async callbacks when supported', async () => {
            const fake = createFakeFramework({ allowAsyncSuites: true });
            const chain = createChain(fake.framework);
            let invoked = false;

            const result = chain.suite('suite', async () => {
                invoked = true;
            });

            expect(result).to.be.an.instanceOf(Promise);
            await result;
            expect(invoked).to.equal(true);
        });
    });

    suite('Lock', () => {
        test('Cannot create suite/hook/test while executing', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            const root = chain.before('root', () => {});
            chain.test('test', () => {
                expect(() => chain.suite('suite', () => {})).to.throw(Error, lockMessage);
                expect(() => chain.before(() => {})).to.throw(Error, lockMessage);
                expect(() => chain.beforeEach(() => {})).to.throw(Error, lockMessage);
                expect(() => chain.test('inner', () => {})).to.throw(Error, lockMessage);
                expect(() => (root.afterEach as ChainHook)(() => {})).to.throw(Error, lockMessage);
            });

            await fake.run('test');
        });

        test('Lock is released after failure', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            chain.test('test', () => {
                throw new Error('<ERROR>');
            });
            await expect(fake.run('test')).to.be.rejectedWith(Error, '<ERROR>');

            expect(() => chain.test('next', () => {})).to.not.throw();
        });
    });

    suite('done', () => {
        test('Hooks and tests receive done callback', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            let seen: unknown;

            const root = chain.before('root', (done: () => void) => {
                setTimeout(done, 1);
                return { a: 1 };
            });
            (root.before as ChainHook)('second', (ctx: object, done: () => void) => {
                seen = ctx;
                done();
            });

            expect(await fake.runWithDone('root')).to.equal(undefined);
            expect(await fake.runWithDone('second')).to.equal(undefined);
            expect(seen).to.deep.equal({ a: 1 });
        });

        test('Forwards errors to done', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);
            const error = new Error('<ERROR>');

            chain.test('test', (done: (err?: unknown) => void) => {
                done(error);
            });

            expect(await fake.runWithDone('test')).to.equal(error);
        });

        test('Reports handler failures to done', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            const root = chain.before('root', () => {});
            (root.before as ChainHook)('second', (_ctx: object, done: () => void) => {
                done();
            });

            expect(await fake.runWithDone('second')).to.be.an.instanceOf(HookOrderError);
        });

        test('Tests returning truthy value fail', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            // Declares (but never calls) done, so test is handled as done-style
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            chain.test('test', (_done: () => void) => '<value>');

            expect(await fake.runWithDone('test')).to.equal(
                'Test returned truthy value: "<value>"'
            );
        });

        test('Lock is released once, even if done is called multiple times', async () => {
            const fake = createFakeFramework();
            const chain = createChain(fake.framework);

            chain.test('test', (done: () => void) => {
                // eslint-disable-next-line n/callback-return
                done();
                done();
            });
            chain.test('next', () => {
                expect(() => chain.test('inner', () => {})).to.throw(Error, lockMessage);
            });

            await fake.runWithDone('test');
            await fake.run('next');
        });

        test('Arguments are forwarded when done is not supported', async () => {
            const fake = createFakeFramework({ supportsDone: false });
            const chain = createChain(fake.framework);
            let seen: unknown;

            chain.test('test', (a: unknown, b: unknown) => {
                seen = [a, b];
            });

            await fake.run('test', undefined, 1, 2);
            expect(seen).to.deep.equal([1, 2]);
        });
    });
});
