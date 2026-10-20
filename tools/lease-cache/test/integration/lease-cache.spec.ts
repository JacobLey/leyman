import type { Cluster } from 'ioredis';
import type { LeaseCacheConnection, LeaseCacheOptions } from 'lease-cache';
import { randomUUID } from 'node:crypto';
import { expectTypeOf } from 'expect-type';
import { Redis } from 'ioredis';
import pDefer from 'p-defer';
import { expect } from '@leyman/expect';
import { LeaseCache } from 'lease-cache';
import { beforeEach, suite, test } from 'mocha-chain';
import { controlledLoader } from '../helpers/loader.js';

/**
 * The devcontainer runs Valkey as a sidecar under this hostname, and Dagger binds its service under the same one.
 */
const valkeyUrl = 'redis://valkey:6379/5';

suite('LeaseCache', () => {
    test('Accepts ioredis connections', () => {
        expectTypeOf<Redis>().toExtend<LeaseCacheConnection>();
        expectTypeOf<Cluster>().toExtend<LeaseCacheConnection>();
    });

    const withConnection = beforeEach(() => {
        // Tests share the server, so each uses its own prefix rather than clearing it
        const prefix = `test-${randomUUID()}`;
        const connection = new Redis(valkeyUrl);
        /**
         * Each cache stands in for a separate process (e.g. a pod), sharing only Valkey with the others.
         *
         * @param options - Options to change from the defaults, which never run out during a test
         * @returns Cache
         */
        const instance = (options: Partial<LeaseCacheOptions> = {}): LeaseCache =>
            new LeaseCache({
                connection,
                prefix,
                ttlMs: 60_000,
                leaseMs: 60_000,
                pollMs: 1,
                waitMs: 60_000,
                ...options,
            });
        return { connection, prefix, instance };
    });

    withConnection.afterEach(async ({ connection }) => {
        await connection.quit();
    });

    suite('get', () => {
        withConnection.test('Loads a missing key', async ({ instance }) => {
            const value = instance().get('key', async () => ({ id: 1 }));

            expectTypeOf(value).toEqualTypeOf<Promise<{ id: number }>>();
            expect(await value).to.deep.equal({ id: 1 });
        });

        withConnection.test(
            'Serves a cached key without loading it again',
            async ({ instance }) => {
                const cache = instance();
                await cache.get('key', async () => 'value');

                expect(await cache.get('key', async () => 'other')).to.equal('value');
            }
        );

        withConnection.test(
            'Caches null, so a missing row is not looked up again',
            async ({ instance }) => {
                const cache = instance();
                await cache.get('key', async () => null);

                expect(await cache.get('key', async () => 'value')).to.equal(null);
            }
        );

        withConnection.test('Caches values for ttlMs', async ({ connection, instance, prefix }) => {
            await instance({ ttlMs: 30_000 }).get('key', async () => 'value');

            // The key `key`, inside its hash tag
            const valueKey = [prefix, '{key}', 'value'].join(':');
            expect(await connection.pttl(valueKey)).to.be.within(1, 30_000);
        });

        withConnection.test('Rejects with what the loader threw', async ({ instance }) => {
            const failure = new Error('Database is down');

            await expect(
                instance().get('key', async () => {
                    throw failure;
                })
            ).to.be.rejectedWith(failure);
        });

        withConnection.test('Caches nothing when loading fails', async ({ instance }) => {
            const cache = instance();
            await expect(
                cache.get('key', async () => {
                    throw new Error('Database is down');
                })
            ).to.be.rejected;

            expect(await cache.get('key', async () => 'value')).to.equal('value');
        });
    });

    suite('leases', () => {
        withConnection.test('Loads a key missed by every instance once', async ({ instance }) => {
            const waiting = pDefer();
            const [first, second] = [
                instance(),
                instance({
                    onWait: () => {
                        waiting.resolve();
                    },
                }),
            ];
            const loader = controlledLoader<string>();

            const fromFirst = first.get('key', loader.load);
            await loader.called(1);
            const fromSecond = second.get('key', loader.load);
            await waiting.promise;
            await loader.resolve(1, 'value');

            expect(await Promise.all([fromFirst, fromSecond])).to.deep.equal(['value', 'value']);
            expect(loader.calls()).to.equal(1);
        });

        withConnection.test(
            'Lets a waiting instance load when the holder fails',
            async ({ instance }) => {
                const waiting = pDefer();
                const [first, second] = [
                    instance(),
                    instance({
                        onWait: () => {
                            waiting.resolve();
                        },
                    }),
                ];
                const loader = controlledLoader<string>();

                const firstFails = expect(first.get('key', loader.load)).to.be.rejected;
                await loader.called(1);
                const fromSecond = second.get('key', loader.load);
                await waiting.promise;
                await loader.reject(1, new Error('Database is down'));
                await loader.resolve(2, 'value');

                await firstFails;
                expect(await fromSecond).to.equal('value');
            }
        );

        withConnection.test('Loads without caching after waiting waitMs', async ({ instance }) => {
            const [first, second] = [instance(), instance({ waitMs: 0 })];
            const loader = controlledLoader<string>();

            const fromFirst = first.get('key', loader.load);
            await loader.called(1);
            const fromSecond = second.get('key', loader.load);
            await loader.resolve(2, 'second');
            expect(await fromSecond).to.equal('second');
            await loader.resolve(1, 'first');
            await fromFirst;

            // Only the lease holder cached its value
            expect(await second.get('key', async () => 'unused')).to.equal('first');
        });
    });

    suite('invalidate', () => {
        withConnection.test('Loads an invalidated key again', async ({ instance }) => {
            const cache = instance();
            await cache.get('key', async () => 'old');

            await cache.invalidate('key');

            expect(await cache.get('key', async () => 'new')).to.equal('new');
        });

        withConnection.test(
            'Never caches a load that finishes after an invalidation',
            async ({ instance }) => {
                const cache = instance();
                const loader = controlledLoader<string>();

                // A read misses, and starts loading the row as it was before an update
                const outdated = cache.get('key', loader.load);
                await loader.called(1);
                // The row is updated, and the key invalidated
                await cache.invalidate('key');
                // The slow load finishes, with the row as it was
                await loader.resolve(1, 'old');
                expect(await outdated).to.equal('old');

                expect(await cache.get('key', async () => 'new')).to.equal('new');
            }
        );

        withConnection.test(
            'Lets the next read load right away, rather than wait on the invalidated lease',
            async ({ instance }) => {
                const cache = instance();
                const loader = controlledLoader<string>();
                const outdated = cache.get('key', loader.load);
                await loader.called(1);

                await cache.invalidate('key');

                expect(await cache.get('key', async () => 'new')).to.equal('new');
                await loader.resolve(1, 'old');
                await outdated;
            }
        );
    });
});
