import type { EventEmitter } from 'node:events';
import type { CacheConfig, LeaseCacheTierOptions } from '@leyman/demo-read-through-cache';
import { on, once } from 'node:events';
import { errors } from 'bentocache';
import { expectTypeOf } from 'expect-type';
import { Redis } from 'ioredis';
import pDefer from 'p-defer';
import {
    bentoValkeyTierBinding,
    cacheConfigId,
    leaseCacheTierBinding,
    memoryTierBinding,
    noMemoryTierBinding,
    ReadThroughCache,
    readThroughCacheModule,
    ResizableValkeyTopology,
    shardedTopologyBinding,
    singleNodeTopologyBinding,
    staleWhileRevalidateBinding,
    syncedMemoryTierBinding,
    valkeyConnectionId,
    valkeyShardId,
    valkeyTopologyId,
    waitForFreshBinding,
} from '@leyman/demo-read-through-cache';
import { expect } from '@leyman/expect';
import { bind, createContainer } from 'haywire';
import { beforeEach, suite } from 'mocha-chain';
import { createRendezvousHash } from 'weighted-rendezvous-hash';
import { cacheEvents } from '../helpers/events.js';
import { controlledLoader } from '../helpers/loader.js';
import { uniquePrefix, valkeyNodes, valkeyUrl, waitForSubscribers } from '../helpers/valkey.js';

/**
 * Long enough to never run out during a test, so tests never depend on timing.
 */
const lease: LeaseCacheTierOptions = { leaseMs: 60_000, pollMs: 1, waitMs: 60_000 };

/**
 * Resolves once the emitter receives a bus message of the given type.
 *
 * @param emitter - Emitter passed to the instance
 * @param type - Bus message type, such as `delete`
 */
const busMessage = async (emitter: EventEmitter, type: string): Promise<void> => {
    for await (const [{ message }] of on(emitter, 'bus:message:received')) {
        if ((message as { type: string }).type === type) {
            return;
        }
    }
};

suite('ReadThroughCache', () => {
    const withInstances = beforeEach(() => {
        const prefix = uniquePrefix();
        const config = (extra: Partial<CacheConfig> = {}) =>
            bind(cacheConfigId).withInstance({ prefix, ttlMs: 60_000, ...extra });
        // The app's own connection: the cache uses it, but must never close it
        const connection = new Redis(valkeyUrl(1));

        /**
         * The plainest cache: one node, BentoCache's own Valkey tier, no memory tier, no grace. Each test swaps in the features it
         * is about with `replaceBinding()`.
         */
        const baseline = readThroughCacheModule
            .addBinding(config())
            .addBinding(bind(valkeyConnectionId).withInstance(connection))
            .addBinding(singleNodeTopologyBinding)
            .addBinding(noMemoryTierBinding)
            .addBinding(waitForFreshBinding)
            .addBinding(bentoValkeyTierBinding);

        const containers: AsyncDisposable[] = [];
        /**
         * Each instance stands in for a separate process (e.g. a pod): its own BentoCache, memory tier and
         * locks, sharing only Valkey with the others.
         *
         * @param module - Cache bindings
         * @returns Cache, disposed after the test
         */
        const instance = (module: typeof baseline = baseline): ReadThroughCache => {
            const container = createContainer(module);
            containers.push(container);
            return container.get(ReadThroughCache);
        };
        return { prefix, config, connection, baseline, instance, containers };
    });

    withInstances.afterEach(async ({ connection, containers }) => {
        await Promise.all(containers.map(async container => container[Symbol.asyncDispose]()));
        await connection.quit();
    });

    suite('get', () => {
        withInstances.test('Loads a missing key', async ({ instance }) => {
            const value = instance().get('key', async () => ({ id: 1 }));

            expectTypeOf(value).toEqualTypeOf<Promise<{ id: number }>>();
            expect(await value).to.deep.equal({ id: 1 });
        });

        withInstances.test('Serves a cached key without loading it again', async ({ instance }) => {
            const cache = instance();
            let loads = 0;
            const load = async (): Promise<string> => {
                loads++;
                return 'value';
            };

            await cache.get('key', load);
            await cache.get('key', load);

            expect(loads).to.equal(1);
        });

        withInstances.test(
            'Caches null, so a missing row is not looked up again',
            async ({ instance }) => {
                const cache = instance();
                await cache.get('key', async () => null);

                expect(await cache.get('key', async () => 'value')).to.equal(null);
            }
        );

        withInstances.test('Shares cached keys between instances', async ({ instance }) => {
            await instance().get('key', async () => 'first');

            expect(await instance().get('key', async () => 'second')).to.equal('first');
        });

        withInstances.test('Loads concurrent misses once per instance', async ({ instance }) => {
            const cache = instance();
            const loader = controlledLoader<string>();

            const values = Promise.all([
                cache.get('key', loader.load),
                cache.get('key', loader.load),
                cache.get('key', loader.load),
            ]);
            await loader.resolve(1, 'value');

            expect(await values).to.deep.equal(['value', 'value', 'value']);
            expect(loader.calls()).to.equal(1);
        });

        withInstances.test(
            'Loads a shared miss once per instance, without a lease',
            async ({ instance }) => {
                const loader = controlledLoader<string>();

                const values = Promise.all([
                    instance().get('key', loader.load),
                    instance().get('key', loader.load),
                ]);
                // Both instances missed before either loaded
                await Promise.all([loader.called(1), loader.called(2)]);
                await Promise.all([loader.resolve(1, 'value'), loader.resolve(2, 'value')]);

                expect(await values).to.deep.equal(['value', 'value']);
            }
        );

        withInstances.test('Rejects with what the loader threw', async ({ instance }) => {
            const failure = new Error('Database is down');

            const error: unknown = await expect(
                instance().get('key', async () => {
                    throw failure;
                })
            ).to.be.rejectedWith(errors.E_FACTORY_ERROR);

            expect(error).to.have.property('cause', failure);
        });

        withInstances.test('Caches nothing when loading fails', async ({ instance }) => {
            const cache = instance();
            await expect(
                cache.get('key', async () => {
                    throw new Error('Database is down');
                })
            ).to.be.rejected;

            expect(await cache.get('key', async () => 'value')).to.equal('value');
        });
    });

    suite('invalidate', () => {
        withInstances.test('Loads an invalidated key again', async ({ instance }) => {
            const cache = instance();
            await cache.get('key', async () => 'old');

            await cache.invalidate('key');

            expect(await cache.get('key', async () => 'new')).to.equal('new');
        });

        withInstances.test(
            'Leaves copies in memory on other instances, without sync',
            async ({ baseline, instance }) => {
                const withMemory = baseline.replaceBinding(memoryTierBinding({ maxItems: 100 }));
                const [first, second] = [instance(withMemory), instance(withMemory)];
                await first.get('key', async () => 'old');
                await second.get('key', async () => 'unused');

                await first.invalidate('key');

                expect(await second.get('key', async () => 'new')).to.equal('old');
            }
        );

        withInstances.test(
            'Drops copies in memory on every instance, with sync',
            async ({ baseline, config, instance, prefix }) => {
                const emitter = cacheEvents();
                const synced = baseline.replaceBinding(syncedMemoryTierBinding({ maxItems: 100 }));
                const [first, second] = [
                    instance(synced),
                    instance(synced.replaceBinding(config({ emitter }))),
                ];
                await first.get('key', async () => 'old');
                await second.get('key', async () => 'unused');
                await waitForSubscribers(`bentocache.notifications:${prefix}`, 2);

                const received = busMessage(emitter, 'delete');
                await first.invalidate('key');
                await received;

                expect(await second.get('key', async () => 'new')).to.equal('new');
            }
        );
    });

    suite('staleWhileRevalidate', () => {
        withInstances.test('Loads an expired key again, without it', async ({ instance }) => {
            const cache = instance();
            await cache.get('key', async () => 'stale');

            await cache.expire('key');

            expect(await cache.get('key', async () => 'fresh')).to.equal('fresh');
        });

        const withStale = withInstances.beforeEach(async ({ baseline, config, instance }) => {
            const emitter = cacheEvents();
            const cache = instance(
                baseline
                    .replaceBinding(staleWhileRevalidateBinding({ graceMs: 120_000 }))
                    .replaceBinding(config({ emitter }))
            );
            await cache.get('key', async () => 'stale');
            await cache.expire('key');
            return { cache, emitter };
        });

        withStale.test('Serves the stale value while loading a fresh one', async ({ cache }) => {
            const loader = controlledLoader<string>();

            expect(await cache.get('key', loader.load)).to.equal('stale');
            await loader.resolve(1, 'fresh');
        });

        withStale.test('Serves the fresh value once loaded', async ({ cache, emitter }) => {
            const written = once(emitter, 'cache:written');
            await cache.get('key', async () => 'fresh');
            await written;

            expect(await cache.get('key', async () => 'unused')).to.equal('fresh');
        });

        withInstances.test('Reports a failed refresh', async ({ baseline, config, instance }) => {
            const failure = new Error('Database is down');
            const reported = pDefer<Error>();
            const cache = instance(
                baseline
                    .replaceBinding(staleWhileRevalidateBinding({ graceMs: 120_000 }))
                    .replaceBinding(
                        config({
                            onLoadError: error => {
                                reported.resolve(error);
                            },
                        })
                    )
            );
            await cache.get('key', async () => 'stale');
            await cache.expire('key');

            await cache.get('key', async () => {
                throw failure;
            });

            expect(await reported.promise).to.have.property('cause', failure);
        });

        withStale.test('Serves the stale value when loading fails', async ({ cache }) => {
            expect(
                await cache.get('key', async () => {
                    throw new Error('Database is down');
                })
            ).to.equal('stale');
        });
    });

    suite('lease-cache', () => {
        const withLease = withInstances.beforeEach(({ baseline }) => ({
            leased: baseline.replaceBinding(leaseCacheTierBinding(lease)),
        }));

        withLease.test(
            'Loads a key missed by every instance once',
            async ({ baseline, instance, leased }) => {
                const waiting = pDefer();
                const [first, second] = [
                    instance(leased),
                    instance(
                        baseline.replaceBinding(
                            leaseCacheTierBinding({
                                ...lease,
                                onWait: () => {
                                    waiting.resolve();
                                },
                            })
                        )
                    ),
                ];
                const loader = controlledLoader<string>();

                const fromFirst = first.get('key', loader.load);
                await loader.called(1);
                const fromSecond = second.get('key', loader.load);
                await waiting.promise;
                await loader.resolve(1, 'value');

                expect(await Promise.all([fromFirst, fromSecond])).to.deep.equal([
                    'value',
                    'value',
                ]);
                expect(loader.calls()).to.equal(1);
            }
        );

        withLease.test(
            'Lets a waiting instance load when the holder fails',
            async ({ baseline, instance, leased }) => {
                const waiting = pDefer();
                const [first, second] = [
                    instance(leased),
                    instance(
                        baseline.replaceBinding(
                            leaseCacheTierBinding({
                                ...lease,
                                onWait: () => {
                                    waiting.resolve();
                                },
                            })
                        )
                    ),
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

        withLease.test(
            'Never caches a load that finishes after an invalidation',
            async ({ instance, leased }) => {
                const cache = instance(leased);
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

        withInstances.test(
            'Serves the old value to instances waiting on a load after an expiry, with staleMs',
            async ({ baseline, instance }) => {
                // No memory tier: the stale value comes from lease-cache
                const kept = baseline.replaceBinding(
                    leaseCacheTierBinding({ ...lease, staleMs: 60_000 })
                );
                const [first, second] = [instance(kept), instance(kept)];
                await first.get('key', async () => 'stale');
                await first.expire('key');
                const loader = controlledLoader<string>();

                const fromFirst = first.get('key', loader.load);
                await loader.called(1);

                expect(await second.get('key', loader.load)).to.equal('stale');
                await loader.resolve(1, 'fresh');
                expect(await fromFirst).to.equal('fresh');
            }
        );

        withInstances.test(
            "Caches a load that finishes after an invalidation, with BentoCache's own tier",
            async ({ instance }) => {
                const cache = instance();
                const loader = controlledLoader<string>();

                const outdated = cache.get('key', loader.load);
                await loader.called(1);
                await cache.invalidate('key');
                await loader.resolve(1, 'old');
                await outdated;

                // The race lease-cache closes: the old row stays cached until it expires
                expect(await cache.get('key', async () => 'new')).to.equal('old');
            }
        );

        withLease.test(
            'Refreshes a stale value on one instance at a time',
            async ({ baseline, config, instance, leased }) => {
                const emitter = cacheEvents();
                const waiting = pDefer();
                // Lease-cache keeps no stale values, so stale-while-revalidate serves them from memory
                const stale = (module: typeof baseline): typeof baseline =>
                    module
                        .replaceBinding(memoryTierBinding({ maxItems: 100 }))
                        .replaceBinding(staleWhileRevalidateBinding({ graceMs: 120_000 }));
                const [first, second] = [
                    instance(stale(leased)),
                    instance(
                        stale(baseline)
                            .replaceBinding(
                                leaseCacheTierBinding({
                                    ...lease,
                                    onWait: () => {
                                        waiting.resolve();
                                    },
                                })
                            )
                            .replaceBinding(config({ emitter }))
                    ),
                ];
                await first.get('key', async () => 'stale');
                await second.get('key', async () => 'unused');
                await Promise.all([first.expire('key'), second.expire('key')]);
                const loader = controlledLoader<string>();

                expect(await first.get('key', loader.load)).to.equal('stale');
                await loader.called(1);
                expect(await second.get('key', loader.load)).to.equal('stale');
                // The second instance's background refresh found the first's lease, and waits for its value
                await waiting.promise;
                const refreshed = once(emitter, 'cache:written');
                await loader.resolve(1, 'fresh');
                await refreshed;

                expect(loader.calls()).to.equal(1);
                expect(await second.get('key', async () => 'unused')).to.equal('fresh');
            }
        );
    });

    suite('topology', () => {
        withInstances.test(
            "Stores keys on the application's connection, and leaves it open",
            async ({ baseline, connection, prefix }) => {
                const container = createContainer(baseline);
                await container.get(ReadThroughCache).get('key', async () => 'value');

                await container[Symbol.asyncDispose]();

                expect(await connection.exists(`${prefix}:key`)).to.equal(1);
            }
        );

        withInstances.test(
            "Spreads keys over the application's shards, and leaves them open",
            async ({ baseline, prefix }) => {
                // The app's connections, one per node, each bound as an element of the shard list
                const [first, second] = [new Redis(valkeyUrl(2)), new Redis(valkeyUrl(3))];
                const container = createContainer(
                    baseline
                        .replaceBinding(shardedTopologyBinding)
                        .addBinding(
                            bind(valkeyShardId).withInstance({
                                name: 'first',
                                size: 1,
                                connection: first,
                            })
                        )
                        .addBinding(
                            bind(valkeyShardId).withInstance({
                                name: 'second',
                                size: 1,
                                connection: second,
                            })
                        )
                );
                const keys = Array.from({ length: 20 }, (_, i) => `key-${i}`);
                await Promise.all(
                    keys.map(async key =>
                        container.get(ReadThroughCache).get(key, async () => 'value')
                    )
                );

                await container[Symbol.asyncDispose]();

                const stored = await Promise.all([
                    first.keys(`${prefix}:*`),
                    second.keys(`${prefix}:*`),
                ]);
                await Promise.all([first.quit(), second.quit()]);
                expect(stored.map(shardKeys => shardKeys.length > 0)).to.deep.equal([true, true]);
                expect(stored.flat()).to.have.length(keys.length);
            }
        );

        // A topology that can change can't come from a binding, so the app creates it, and resizes it
        const withTopology = withInstances.beforeEach(() => ({
            topology: new ResizableValkeyTopology(valkeyNodes(2)),
        }));

        withTopology.afterEach(async ({ topology }) => {
            await topology.close();
        });

        withTopology.test(
            'Only loads keys again whose node changed when resized',
            async ({ baseline, instance, topology }) => {
                const cache = instance(
                    baseline.replaceBinding(bind(valkeyTopologyId).withInstance(topology))
                );
                const keys = Array.from({ length: 50 }, (_, i) => `key-${i}`);
                await Promise.all(keys.map(async key => cache.get(key, async () => 'value')));

                await topology.resize(valkeyNodes(3));
                let loads = 0;
                await Promise.all(
                    keys.map(async key =>
                        cache.get(key, async () => {
                            loads++;
                            return 'value';
                        })
                    )
                );

                const [before, after] = [
                    createRendezvousHash(valkeyNodes(2)),
                    createRendezvousHash(valkeyNodes(3)),
                ];
                const moved = keys.filter(key => before.get(key).name !== after.get(key).name);
                expect(loads).to.equal(moved.length);
            }
        );
    });
});
