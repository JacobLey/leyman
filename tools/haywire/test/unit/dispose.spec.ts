import type { Supplier } from 'haywire';
import { setTimeout } from 'node:timers/promises';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import {
    bind,
    createContainer,
    createContainerFactory,
    createModule,
    eagerSingletonScope,
    HaywireContainerValidationError,
    HaywireError,
    identifier,
    requestScope,
    singletonScope,
} from 'haywire';
import {
    HaywireContainerDisposedError,
    HaywireDisposerScopeError,
    HaywireMultiError,
} from '#errors';

const catchThrown = async (fn: () => unknown): Promise<unknown> => {
    try {
        await fn();
        // eslint-disable-next-line @typescript-eslint/return-await, unicorn/no-useless-promise-resolve-reject
        return Promise.reject(new Error('Did not throw'));
    } catch (err) {
        return err;
    }
};

interface Resource extends Disposable {
    readonly name: string;
}

suite('dispose', () => {
    const makeLog = (): {
        log: string[];
        createResource: (name: string) => Resource;
        createAsyncResource: (name: string) => AsyncDisposable & Resource;
    } => {
        const log: string[] = [];
        return {
            log,
            createResource: name => ({
                name,
                [Symbol.dispose]: () => {
                    log.push(`dispose ${name}`);
                },
            }),
            createAsyncResource: name => ({
                name,
                [Symbol.asyncDispose]: async () => {
                    await setTimeout(1);
                    log.push(`asyncDispose ${name}`);
                },
                [Symbol.dispose]: () => {
                    log.push(`dispose ${name}`);
                },
            }),
        };
    };

    test('Disposes singletons in reverse creation order', async () => {
        const { log, createResource } = makeLog();
        const dbId = identifier<Resource>().named('db');
        const repoId = identifier<Resource>().named('repo');
        const handlerId = identifier<Resource>().named('handler');
        const requestId = identifier<Resource>().named('request');

        const container = createContainer(
            createModule(
                bind(dbId)
                    .withDependencies([])
                    .withProvider(() => createResource('db'))
                    .scoped(singletonScope)
            )
                .addBinding(
                    bind(repoId)
                        .withDependencies([dbId])
                        .withProvider(() => createResource('repo'))
                        .scoped(eagerSingletonScope)
                )
                .addBinding(
                    bind(handlerId)
                        .withDependencies([repoId, requestId])
                        .withProvider(() => createResource('handler'))
                )
                .addBinding(
                    bind(requestId)
                        .withDependencies([])
                        .withProvider(() => createResource('request'))
                        .scoped(requestScope)
                )
        );

        container.get(handlerId);
        container.get(handlerId);

        await container.disposeAsync();
        // Transient and request instances belong to whoever requested them
        expect(log).to.deep.equal(['dispose repo', 'dispose db']);
    });

    test('Prefers Symbol.asyncDispose, and supports `await using`', async () => {
        const { log, createAsyncResource } = makeLog();
        const id = identifier<Resource>();

        {
            await using container = createContainer(
                createModule(
                    bind(id)
                        .withDependencies([])
                        .withAsyncProvider(async () => createAsyncResource('a'))
                        .scoped(singletonScope)
                )
            );
            await container.getAsync(id);
        }

        expect(log).to.deep.equal(['asyncDispose a']);
    });

    test('Custom and disabled disposers', async () => {
        const { log, createResource } = makeLog();
        const customId = identifier<{ name: string }>().named('custom');
        const disabledId = identifier<Resource>().named('disabled');
        const plainId = identifier<number>();

        const customBinding = bind(customId)
            .withDependencies([])
            .withProvider(() => ({ name: 'custom' }))
            .scoped(singletonScope)
            .withDisposer(instance => {
                expectTypeOf(instance).toEqualTypeOf<{ name: string }>();
                log.push(`custom ${instance.name}`);
            });

        const container = createContainer(
            createModule(customBinding)
                .addBinding(
                    bind(disabledId)
                        .withDependencies([])
                        .withProvider(() => createResource('disabled'))
                        .scoped(singletonScope)
                        .withDisposer(null)
                )
                .addBinding(
                    bind(plainId)
                        .withDependencies([])
                        .withProvider(() => 123)
                        .scoped(singletonScope)
                )
        );
        container.get(customId);
        container.get(disabledId);
        container.get(plainId);

        await container.disposeAsync();
        expect(log).to.deep.equal(['custom custom']);
    });

    test('Instances the caller provided are not disposed', async () => {
        const { log, createResource } = makeLog();
        const instanceId = identifier<Resource>().named('instance');
        const boundId = identifier<Resource>().named('bound');
        const ownedId = identifier<Resource>().named('owned');
        const createdId = identifier<Resource>().named('created');

        const factory = createContainerFactory(
            createModule(bind(instanceId).withInstance(createResource('instance')))
                .addBinding(
                    bind(ownedId)
                        .withInstance(createResource('owned'))
                        .withDisposer(instance => {
                            instance[Symbol.dispose]();
                        })
                )
                .addBinding(
                    bind(createdId)
                        .withDependencies([boundId])
                        .withProvider(() => createResource('created'))
                        .scoped(singletonScope)
                )
        );

        const requestContainer = factory
            .bindInstance(boundId, createResource('bound'))
            .toContainer();
        const otherContainer = factory.bindInstance(boundId, createResource('other')).toContainer();

        requestContainer.get(createdId);
        otherContainer.get(createdId);

        await requestContainer.disposeAsync();
        expect(log).to.deep.equal(['dispose created', 'dispose owned']);
    });

    test('Disposes each list element, skipping null', async () => {
        const { log, createResource } = makeLog();
        const id = identifier<Resource>().nullable().list();

        const container = createContainer(
            createModule(
                bind(id)
                    .withDependencies([])
                    .withProvider(() => createResource('a'))
                    .scoped(singletonScope)
            )
                .addBinding(
                    bind(id)
                        .withDependencies([])
                        .withProvider(() => null)
                        .scoped(singletonScope)
                )
                .addBinding(
                    bind(id)
                        .withDependencies([])
                        .withProvider(() => createResource('c'))
                        .scoped(singletonScope)
                        .withDisposer(instance => {
                            log.push(`custom ${instance.name}`);
                        })
                )
        );
        container.get(id);

        await container.disposeAsync();
        expect(log).to.deep.equal(['custom c', 'dispose a']);
    });

    test('Waits for requests and preloads in progress', async () => {
        const { log, createResource } = makeLog();
        const eagerId = identifier<Resource>().named('eager');
        const lazyId = identifier<Resource>().named('lazy');

        const container = createContainer(
            createModule(
                bind(eagerId)
                    .withDependencies([])
                    .withAsyncProvider(async () => {
                        await setTimeout(5);
                        return createResource('eager');
                    })
                    .scoped(eagerSingletonScope)
            ).addBinding(
                bind(lazyId)
                    .withDependencies([])
                    .withAsyncProvider(async () => {
                        await setTimeout(5);
                        return createResource('lazy');
                    })
                    .scoped(singletonScope)
            )
        );

        const preload = container.preloadAsync();
        const disposed = container.disposeAsync();
        await Promise.all([preload, disposed]);
        expect(log).to.deep.equal(['dispose eager']);

        const container2 = createContainer(
            createModule(
                bind(lazyId)
                    .withDependencies([])
                    .withAsyncProvider(async () => {
                        await setTimeout(5);
                        return createResource('lazy');
                    })
                    .scoped(singletonScope)
            )
        );
        await container2.preloadAsync();
        const request = container2.getAsync(lazyId);
        await setTimeout(1);
        const disposed2 = container2.disposeAsync();
        await Promise.all([request, disposed2]);
        expect(log).to.deep.equal(['dispose eager', 'dispose lazy']);
    });

    test('Is idempotent', async () => {
        const { log, createResource } = makeLog();
        const id = identifier<Resource>();
        const container = createContainer(
            createModule(
                bind(id)
                    .withDependencies([])
                    .withProvider(() => createResource('a'))
                    .scoped(singletonScope)
            )
        );
        container.get(id);

        await Promise.all([container.disposeAsync(), container.disposeAsync()]);
        await container[Symbol.asyncDispose]();
        expect(log).to.deep.equal(['dispose a']);
    });

    test('Rejects requests once disposed, including from suppliers', async () => {
        const syncId = identifier<{ sync: true }>();
        const asyncId = identifier<{ async: true }>();
        const ownerId = identifier<{
            sync: Supplier<{ sync: true }>;
            async: () => Promise<{ async: true }>;
        }>();

        const module = createModule(
            bind(syncId)
                .withDependencies([])
                .withProvider(() => ({ sync: true }) as const)
        )
            .addBinding(
                bind(asyncId)
                    .withDependencies([])
                    .withAsyncProvider(async () => ({ async: true }) as const)
            )
            .addBinding(
                bind(ownerId)
                    .withDependencies([syncId.supplier(), asyncId.supplier('async')])
                    .withProvider((sync, async) => ({ sync, async }))
            );

        const container = createContainer(module);
        const owner = await container.getAsync(ownerId);
        await container.disposeAsync();

        expect(() => owner.sync()).to.throw(HaywireContainerDisposedError);
        expect(await catchThrown(owner.async)).to.be.an.instanceOf(HaywireContainerDisposedError);
        const err = await catchThrown(async () => container.getAsync(ownerId));
        expect(err).to.be.an.instanceOf(HaywireContainerDisposedError);
        expect(err).to.be.an.instanceOf(HaywireError);
        expect(await catchThrown(async () => container.preloadAsync())).to.be.an.instanceOf(
            HaywireContainerDisposedError
        );

        const syncContainer = createContainer(
            createModule(bind(syncId).withInstance({ sync: true }))
        );
        await syncContainer.disposeAsync();
        expect(() => syncContainer.get(syncId)).to.throw(HaywireContainerDisposedError);
        expect(() => {
            syncContainer.preload();
        }).to.throw(HaywireContainerDisposedError);
    });

    suite('Disposer failures', () => {
        test('Disposes the rest, then throws the failure', async () => {
            const { log, createResource } = makeLog();
            const okId = identifier<Resource>().named('ok');
            const failId = identifier<Resource>().named('fail');
            const failure = new Error('<FAIL>');

            const container = createContainer(
                createModule(
                    bind(okId)
                        .withDependencies([])
                        .withProvider(() => createResource('ok'))
                        .scoped(singletonScope)
                ).addBinding(
                    bind(failId)
                        .withDependencies([okId])
                        .withProvider(() => createResource('fail'))
                        .scoped(singletonScope)
                        .withDisposer(() => {
                            throw failure;
                        })
                )
            );
            container.get(failId);

            expect(await catchThrown(async () => container.disposeAsync())).to.equal(failure);
            expect(log).to.deep.equal(['dispose ok']);
        });

        test('Combines several failures', async () => {
            const aId = identifier<object>().named('a');
            const bId = identifier<object>().named('b');
            const disposer = (): never => {
                throw new Error('<FAIL>');
            };

            const container = createContainer(
                createModule(
                    bind(aId)
                        .withDependencies([])
                        .withProvider(() => ({}))
                        .scoped(singletonScope)
                        .withDisposer(disposer)
                ).addBinding(
                    bind(bId)
                        .withDependencies([])
                        .withProvider(() => ({}))
                        .scoped(singletonScope)
                        .withDisposer(disposer)
                )
            );
            container.get(aId);
            container.get(bId);

            const err = await catchThrown(async () => container.disposeAsync());
            expect(err).to.be.an.instanceOf(HaywireMultiError);
            expect((err as HaywireMultiError).causes).to.have.length(2);
        });
    });

    test('Disposers are only allowed on singletons', () => {
        const transientId = identifier<object>().named('transient');
        const requestScopedId = identifier<object>().named('request');
        const nullId = identifier<object>().named('null');

        const container = createContainer(
            createModule(
                bind(transientId)
                    .withDependencies([])
                    .withProvider(() => ({}))
                    .withDisposer(() => {})
            )
                .addBinding(
                    bind(requestScopedId)
                        .withDependencies([])
                        .withProvider(() => ({}))
                        .withDisposer(() => {})
                        .scoped(requestScope)
                )
                .addBinding(
                    bind(nullId)
                        .withDependencies([])
                        .withProvider(() => ({}))
                        .withDisposer(null)
                )
        );

        const err = (() => {
            try {
                container.check();
            } catch (error) {
                return error;
            }
            return null;
        })();
        expect(err).to.be.an.instanceOf(HaywireDisposerScopeError);
        expect(err).to.be.an.instanceOf(HaywireContainerValidationError);
        expect((err as HaywireDisposerScopeError).outputIds).to.deep.equal([
            transientId,
            requestScopedId,
        ]);
    });
});
