import type { Cluster } from 'ioredis';
import type { Redis as Valkey } from 'iovalkey';
import type { Json, LeaseCacheConnection, LeaseCacheOptions, ReadResult } from 'lease-cache';
import { randomUUID } from 'node:crypto';
import { expectTypeOf } from 'expect-type';
import { Redis } from 'ioredis';
import pDefer from 'p-defer';
import { expect } from '@leyman/expect';
import {
    LeaseCache,
    LeaseCacheDurationError,
    LeaseCacheError,
    LeaseCacheValueError,
} from 'lease-cache';
import { before, suite, test } from 'mocha-chain';
import { clients } from '../helpers/clients.js';
import { controlledLoader } from '../helpers/loader.js';

suite('LeaseCache', () => {
    test('Accepts ioredis and iovalkey connections', () => {
        expectTypeOf<Redis>().toExtend<LeaseCacheConnection>();
        expectTypeOf<Cluster>().toExtend<LeaseCacheConnection>();
        expectTypeOf<Valkey>().toExtend<LeaseCacheConnection>();
    });

    suite('durations', () => {
        const options: LeaseCacheOptions = {
            connection: { eval: async () => null },
            prefix: 'unused',
            ttlMs: 1000,
            leaseMs: 1000,
            pollMs: 10,
            waitMs: 1000,
        };

        for (const option of ['ttlMs', 'leaseMs', 'pollMs'] as const) {
            test(`Rejects a ${option} that isn't above 0`, () => {
                expect(() => new LeaseCache({ ...options, [option]: 0 })).to.throw(
                    LeaseCacheDurationError
                );
            });
        }

        for (const option of ['waitMs', 'staleMs'] as const) {
            test(`Rejects a negative ${option}`, () => {
                expect(() => new LeaseCache({ ...options, [option]: -1 })).to.throw(
                    LeaseCacheDurationError
                );
            });
        }

        test('Rejects a duration that is not a number', () => {
            expect(() => new LeaseCache({ ...options, ttlMs: Number.NaN })).to.throw(
                LeaseCacheDurationError
            );
        });

        test('Throws errors that share a base class', () => {
            expect(() => new LeaseCache({ ...options, ttlMs: 0 })).to.throw(LeaseCacheError);
        });
    });

    suite('Valkey unavailable', () => {
        const down = new Error('Connection is closed');
        /**
         * A connection that answers with `answers` in turn, then fails every command, as Valkey going down would.
         *
         * @param answers - What each command before the failure returns
         * @returns Connection
         */
        const failing = (...answers: unknown[]): LeaseCacheConnection => {
            let calls = 0;
            return {
                eval: async () => {
                    if (calls === answers.length) {
                        throw down;
                    }
                    const answer = answers[calls];
                    calls++;
                    return answer;
                },
            };
        };
        const options = {
            prefix: 'unused',
            ttlMs: 1000,
            leaseMs: 1000,
            pollMs: 10,
            waitMs: 1000,
        };

        test("Rejects with Valkey's error by default", async () => {
            const cache = new LeaseCache({ ...options, connection: failing() });

            await expect(cache.get('key', async () => 'value')).to.be.rejectedWith(down);
        });

        test('Loads without caching, with onUnavailable', async () => {
            const reported: [unknown, string][] = [];
            const cache = new LeaseCache({
                ...options,
                connection: failing(),
                onUnavailable: (error, key) => {
                    reported.push([error, key]);
                },
            });

            expect(await cache.read('key', async () => 'value')).to.deep.equal({
                value: 'value',
                source: 'unavailable',
                ttlMs: 0,
            });
            expect(reported).to.deep.equal([[down, 'key']]);
        });

        test('Keeps what was loaded when Valkey fails after the load', async () => {
            let loads = 0;
            const cache = new LeaseCache({
                ...options,
                // Takes the lease, then fails to fill
                connection: failing(['lease']),
                onUnavailable: () => {},
            });

            const read = await cache.read('key', async () => {
                loads++;
                return 'value';
            });

            expect(read).to.include({ value: 'value', source: 'unavailable' });
            expect(loads).to.equal(1);
        });

        test('Rejects with what the loader threw, not the failed release', async () => {
            const failure = new Error('Database is down');
            // Takes the lease, then fails to free it
            const cache = new LeaseCache({ ...options, connection: failing(['lease']) });

            await expect(
                cache.get('key', async () => {
                    throw failure;
                })
            ).to.be.rejectedWith(failure);
        });

        test('Reports a failed release, with onUnavailable', async () => {
            const reported: unknown[] = [];
            const cache = new LeaseCache({
                ...options,
                connection: failing(['lease']),
                onUnavailable: error => {
                    reported.push(error);
                },
            });

            await expect(
                cache.get('key', async () => {
                    throw new Error('Database is down');
                })
            ).to.be.rejected;
            expect(reported).to.deep.equal([down]);
        });

        test('Rejects an invalidation, even with onUnavailable', async () => {
            const cache = new LeaseCache({
                ...options,
                connection: failing(),
                onUnavailable: () => {},
            });

            await expect(cache.invalidate('key')).to.be.rejectedWith(down);
        });
    });

    // Inspects what the cache stored, whichever client the cache uses
    const withValkey = before(() => ({ valkey: new Redis('redis://valkey:6379/5') }));
    withValkey.after(async ({ valkey }) => {
        await valkey.quit();
    });

    for (const { name, connect } of clients) {
        suite(name, () => {
            const withClient = withValkey.before(async () => ({ client: await connect() }));
            withClient.after(async ({ client }) => {
                await client.close();
            });

            const withConnection = withClient.beforeEach(({ client: { connection } }) => {
                // Tests share the server, so each uses its own prefix rather than clearing it
                const prefix = `test-${randomUUID()}`;
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
                return { prefix, connection, instance };
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

                withConnection.test(
                    'Caches values for ttlMs',
                    async ({ instance, prefix, valkey }) => {
                        await instance({ ttlMs: 30_000 }).get('key', async () => 'value');

                        // The key `key`, inside its hash tag
                        const valueKey = [prefix, '{key}', 'value'].join(':');
                        expect(await valkey.pttl(valueKey)).to.be.within(1, 30_000);
                    }
                );

                withConnection.test(
                    'Caches a value for the ttlMs given to get',
                    async ({ instance, prefix, valkey }) => {
                        await instance({ ttlMs: 60_000 }).get('key', async () => 'value', {
                            ttlMs: 5000,
                        });

                        const valueKey = [prefix, '{key}', 'value'].join(':');
                        expect(await valkey.pttl(valueKey)).to.be.within(1, 5000);
                    }
                );

                withConnection.test(
                    'Caches a value for the ttlMs computed from it',
                    async ({ instance, prefix, valkey }) => {
                        const cache = instance({ ttlMs: 60_000 });
                        const ttlMs = (value: string | null): number =>
                            value === null ? 5000 : 30_000;
                        await cache.get('missing', async () => null, { ttlMs });
                        await cache.get('found', async () => 'value', { ttlMs });

                        expect(
                            await valkey.pttl([prefix, '{missing}', 'value'].join(':'))
                        ).to.be.within(1, 5000);
                        expect(
                            await valkey.pttl([prefix, '{found}', 'value'].join(':'))
                        ).to.be.within(5001, 30_000);
                    }
                );

                withConnection.test(
                    'Rounds a ttlMs up to a whole millisecond',
                    async ({ instance, prefix, valkey }) => {
                        await instance().get('key', async () => 'value', { ttlMs: () => 1500.5 });

                        const valueKey = [prefix, '{key}', 'value'].join(':');
                        expect(await valkey.pttl(valueKey)).to.be.within(1, 1501);
                    }
                );

                withConnection.test(
                    'Rejects a computed ttlMs that is not above 0, freeing the lease',
                    async ({ instance }) => {
                        const cache = instance();
                        await expect(
                            cache.get('key', async () => 'value', { ttlMs: () => 0 })
                        ).to.be.rejectedWith(LeaseCacheDurationError);

                        // Loads right away, rather than wait on the lease for waitMs
                        expect(await cache.get('key', async () => 'next')).to.equal('next');
                    }
                );

                withConnection.test(
                    'Rejects a value JSON cannot store, caching nothing',
                    async ({ instance }) => {
                        const cache = instance();
                        await expect(
                            cache.get('key', async () => undefined as unknown as Json)
                        ).to.be.rejectedWith(LeaseCacheValueError);

                        expect(await cache.get('key', async () => 'next')).to.equal('next');
                    }
                );

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

            suite('read', () => {
                withConnection.test(
                    'Says a loaded value was cached, and for how long',
                    async ({ instance }) => {
                        const read = instance().read('key', async () => ({ id: 1 }), {
                            ttlMs: 5000,
                        });

                        expectTypeOf(read).toEqualTypeOf<Promise<ReadResult<{ id: number }>>>();
                        expect(await read).to.deep.equal({
                            value: { id: 1 },
                            source: 'filled',
                            ttlMs: 5000,
                        });
                    }
                );

                withConnection.test(
                    'Says a cached value was a hit, with the time it has left',
                    async ({ instance }) => {
                        const cache = instance();
                        await cache.get('key', async () => 'value', { ttlMs: 5000 });

                        const read = await cache.read('key', async () => 'other');

                        expect(read).to.include({ value: 'value', source: 'hit' });
                        expect(read.ttlMs).to.be.within(1, 5000);
                    }
                );

                withConnection.test(
                    'Says a load that lost its lease was not cached',
                    async ({ instance }) => {
                        const cache = instance();
                        const loader = controlledLoader<string>();
                        const outdated = cache.read('key', loader.load);
                        await loader.called(1);
                        await cache.invalidate('key');
                        await loader.resolve(1, 'old');

                        expect(await outdated).to.deep.equal({
                            value: 'old',
                            source: 'lost',
                            ttlMs: 0,
                        });
                    }
                );

                withConnection.test('Says a stale value was not cached', async ({ instance }) => {
                    const [first, second] = [
                        instance({ staleMs: 60_000 }),
                        instance({ staleMs: 60_000 }),
                    ];
                    await first.get('key', async () => 'old');
                    await first.invalidate('key');
                    const loader = controlledLoader<string>();
                    const fromFirst = first.get('key', loader.load);
                    await loader.called(1);

                    expect(await second.read('key', loader.load)).to.deep.equal({
                        value: 'old',
                        source: 'stale',
                        ttlMs: 0,
                    });
                    await loader.resolve(1, 'new');
                    await fromFirst;
                });

                withConnection.test(
                    'Says a load after waiting waitMs was not cached',
                    async ({ instance }) => {
                        const [first, second] = [instance(), instance({ waitMs: 0 })];
                        const loader = controlledLoader<string>();
                        const fromFirst = first.get('key', loader.load);
                        await loader.called(1);

                        const fromSecond = second.read('key', loader.load);
                        await loader.resolve(2, 'second');

                        expect(await fromSecond).to.deep.equal({
                            value: 'second',
                            source: 'timeout',
                            ttlMs: 0,
                        });
                        await loader.resolve(1, 'first');
                        await fromFirst;
                    }
                );
            });

            suite('leases', () => {
                withConnection.test(
                    'Loads a key missed by every instance once',
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

                withConnection.test(
                    'Calls onWait once for each wait',
                    async ({ connection, instance }) => {
                        const waits: string[] = [];
                        const polledAgain = pDefer();
                        let polls = 0;
                        const [first, second] = [
                            instance(),
                            instance({
                                // Counts the waiting reader's checks, to resolve once it checked a few times
                                connection: {
                                    eval: async (...args) => {
                                        polls++;
                                        if (polls === 3) {
                                            polledAgain.resolve();
                                        }
                                        return connection.eval(...args);
                                    },
                                },
                                onWait: key => {
                                    waits.push(key);
                                },
                            }),
                        ];
                        const loader = controlledLoader<string>();
                        const fromFirst = first.get('key', loader.load);
                        await loader.called(1);
                        const fromSecond = second.get('key', loader.load);

                        await polledAgain.promise;
                        await loader.resolve(1, 'value');
                        await Promise.all([fromFirst, fromSecond]);

                        expect(waits).to.deep.equal(['key']);
                    }
                );

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

                withConnection.test(
                    'Loads without caching after waiting waitMs',
                    async ({ instance }) => {
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
                    }
                );
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
            suite('stale while waiting', () => {
                withConnection.test(
                    'Serves the invalidated value to readers that would wait on the next load',
                    async ({ instance }) => {
                        const [first, second] = [
                            instance({ staleMs: 60_000 }),
                            instance({ staleMs: 60_000 }),
                        ];
                        await first.get('key', async () => 'old');
                        await first.invalidate('key');
                        const loader = controlledLoader<string>();

                        const fromFirst = first.get('key', loader.load);
                        await loader.called(1);

                        expect(await second.get('key', loader.load)).to.equal('old');
                        await loader.resolve(1, 'new');
                        expect(await fromFirst).to.equal('new');
                        expect(loader.calls()).to.equal(1);
                    }
                );

                withConnection.test(
                    'Drops the stale value once the new one is cached',
                    async ({ instance, prefix, valkey }) => {
                        const waiting = pDefer();
                        const [first, second] = [
                            instance({ staleMs: 60_000 }),
                            instance({
                                staleMs: 60_000,
                                onWait: () => {
                                    waiting.resolve();
                                },
                            }),
                        ];
                        await first.get('key', async () => 'old');
                        await first.invalidate('key');
                        await first.get('key', async () => 'new');
                        // The new value expires, without an invalidation to keep it as stale
                        await valkey.del([prefix, '{key}', 'value'].join(':'));
                        const loader = controlledLoader<string>();

                        const fromFirst = first.get('key', loader.load);
                        await loader.called(1);
                        const fromSecond = second.get('key', loader.load);

                        // Waits rather than serve 'old', older than what was cached since
                        await waiting.promise;
                        await loader.resolve(1, 'newer');
                        expect(await Promise.all([fromFirst, fromSecond])).to.deep.equal([
                            'newer',
                            'newer',
                        ]);
                    }
                );

                withConnection.test(
                    'Keeps the stale value for staleMs',
                    async ({ instance, prefix, valkey }) => {
                        const cache = instance({ staleMs: 30_000 });
                        await cache.get('key', async () => 'old');

                        await cache.invalidate('key');

                        const staleKey = [prefix, '{key}', 'stale'].join(':');
                        expect(await valkey.pttl(staleKey)).to.be.within(1, 30_000);
                    }
                );

                withConnection.test(
                    'Keeps no stale value by default',
                    async ({ instance, prefix, valkey }) => {
                        const cache = instance();
                        await cache.get('key', async () => 'old');

                        await cache.invalidate('key');

                        const staleKey = [prefix, '{key}', 'stale'].join(':');
                        expect(await valkey.exists(staleKey)).to.equal(0);
                    }
                );
            });
        });
    }
});
