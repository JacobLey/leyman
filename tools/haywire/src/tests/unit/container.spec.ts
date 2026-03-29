import type { AsyncSupplier, HaywireIdType, LateBinding, MultiList, Supplier } from 'haywire';
import { setTimeout } from 'node:timers/promises';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import {
    AsyncContainer,
    bind,
    createContainer,
    createFactory,
    createModule,
    HaywireContainerValidationError,
    HaywireModuleValidationError,
    identifier,
    isSyncContainer,
    optimisticRequestScope,
    optimisticSingletonScope,
    requestScope,
    singletonScope,
    supplierScope,
    SyncContainer,
    transientScope,
} from 'haywire';
import { InstanceBinding, TempBinding } from '#binding';
import { addBoundInstances } from '#container';
import {
    HaywireCircularDependencyError,
    HaywireInstanceOfResponseError,
    HaywireListResponseError,
    HaywireMultiError,
    HaywireNullResponseError,
    HaywireProviderMissingError,
    HaywireSyncSupplierError,
    HaywireUndefinedResponseError,
} from '#errors';
import { expect } from '../chai-hooks.js';

const catchThrown = async (fn: () => unknown): Promise<unknown> => {
    try {
        await fn();
        // eslint-disable-next-line @typescript-eslint/return-await, unicorn/no-useless-promise-resolve-reject
        return Promise.reject(new Error('Did not throw'));
    } catch (err) {
        return err;
    }
};

suite('container', () => {
    class TrackParams {
        public readonly params: unknown[];
        public constructor(...params: unknown[]) {
            this.params = params;
        }
    }

    class A extends TrackParams {
        public readonly a = 'a';
    }
    class B extends TrackParams {
        public readonly b = 'b';
    }
    class C extends TrackParams {
        public readonly c = 'c';
    }
    class D extends TrackParams {
        public readonly d = 'd';
    }
    class E extends TrackParams {
        public readonly e = 'e';
    }
    class F extends TrackParams {
        public readonly f = 'f';
    }

    class LinkedList {
        public next: LinkedList | null | undefined;
        public constructor(next: LinkedList | null | undefined) {
            this.next = next;
        }
    }

    class Chicken {
        public readonly egg: Egg | null;
        public constructor(egg: Egg | null) {
            this.egg = egg;
        }
    }
    class Egg {
        public readonly chicken: Chicken | null;
        public constructor(chicken: Chicken | null) {
            this.chicken = chicken;
        }
    }

    test('SyncContainer', async () => {
        const c = new C();

        const module = createModule(bind(A).withDependencies([B, D]).withConstructorProvider())
            .addBinding(bind(B).withDependencies([C, D]).withConstructorProvider())
            .addBinding(bind(C).withInstance(c))
            .addBinding(bind(D).withConstructorGenerator().scoped(requestScope));

        const container = createContainer(module);
        expect(container).to.be.an.instanceOf(SyncContainer);
        expect(isSyncContainer(container)).to.equal(true);

        const a = container.get(A);
        expectTypeOf(a).toEqualTypeOf<A>();
        expect(a).to.be.an.instanceOf(A);
        expect(a.params[0]).to.be.an.instanceOf(B);
        expect(a.params[1]).to.be.an.instanceOf(D);

        expect(container.get(C)).to.equal(c);

        expect((a.params[0] as B).params[0]).to.equal(c);
        expect((a.params[0] as B).params[1]).to.be.instanceOf(D);
        expect((a.params[0] as B).params[1]).to.equal(a.params[1]);

        expect(container.get(A)).to.not.equal(a);
        expect(container.get(A).params[1]).to.not.equal(a.params[1]);

        expect(await container.getAsync(A)).to.be.an.instanceOf(A);
        expect(await container.getAsync(C)).to.equal(c);

        // Idempotent
        container.check();
        container.wire();
        container.preload();
        await container.preloadAsync();
    });

    test('AsyncContainer', async () => {
        const module = createModule(bind(A).withDependencies([B, D]).withConstructorProvider())
            .addBinding(
                bind(B)
                    .withDependencies([C, D])
                    .withAsyncProvider(async (...params) => new B(...params))
            )
            .addBinding(
                bind(C)
                    .withAsyncGenerator(() => new C())
                    .scoped(singletonScope)
            )
            .addBinding(bind(D).withConstructorGenerator().scoped(requestScope));

        const container = createContainer(module);
        expect(container).to.be.an.instanceOf(AsyncContainer);
        expect(container).to.not.be.an.instanceOf(SyncContainer);
        expectTypeOf(container).not.toHaveProperty('getSync');
        expect(isSyncContainer(container)).to.equal(false);

        const a1 = await container.getAsync(A);
        expectTypeOf(a1).toEqualTypeOf<A>();
        expect(a1).to.be.an.instanceOf(A);
        expect(a1.params[0]).to.be.an.instanceOf(B);
        expect(a1.params[1]).to.be.an.instanceOf(D);

        const c = await container.getAsync(identifier(C).nullable().undefinable());
        expectTypeOf(c).toEqualTypeOf<C | null | undefined>();
        expect(c).to.be.an.instanceOf(C);

        expect(await container.getAsync(C)).to.equal(c);

        expect(await createContainer(module).getAsync(C)).to.not.equal(c);

        expect((a1.params[0] as B).params[0]).to.equal(c);
        expect((a1.params[0] as B).params[1]).to.be.instanceOf(D);
        expect((a1.params[0] as B).params[1]).to.equal(a1.params[1]);

        expect(await container.getAsync(A)).to.not.equal(a1);
        const a2 = await container.getAsync(A);
        expect(a2.params[1]).to.not.equal(a1.params[1]);

        expect(await container.getAsync(A)).to.be.an.instanceOf(A);
        expect(await container.getAsync(C)).to.equal(c);

        // Idempotent
        container.check();
        container.wire();
        await container.preloadAsync();
    });

    suite('Validation failures', () => {
        test('No dependency defined', () => {
            class Simple {
                public readonly foo: number = 1;
            }
            class Similar {
                public readonly foo: number = 2;
            }
            class Different {
                public readonly simple: Simple;
                public constructor(simple: Simple) {
                    this.simple = simple;
                }
            }

            const container = createContainer(
                createModule(
                    bind(Different).withConstructorProvider().withDependencies([Similar])
                ).addBinding(bind(Simple).withConstructorGenerator())
            );

            expect(() => {
                container.wire();
            }).to.throw(
                HaywireContainerValidationError,
                'Providers missing for container: Similar'
            );
        });

        suite('Non-existent output is requested', () => {
            const aId = identifier<A>();
            const module = createModule(bind(aId).withGenerator(() => new A())).addBinding(
                bind(identifier(B)).withGenerator(() => new B())
            );

            test('sync', () => {
                const syncContainer = createContainer(module);
                syncContainer.preload();

                expect(() => {
                    // @ts-expect-error
                    syncContainer.get(A);
                }).to.throw(HaywireContainerValidationError, 'Providers missing for container: A');

                expect(() => {
                    // @ts-expect-error
                    syncContainer.get(identifier<B>());
                }).to.throw(
                    HaywireContainerValidationError,
                    'Providers missing for container: haywire-id'
                );
            });

            test('async', async () => {
                const asyncContainer = createContainer(
                    module.addBinding(bind(C).withAsyncGenerator(() => new C()))
                );
                await asyncContainer.preloadAsync();

                await expect(
                    // @ts-expect-error
                    asyncContainer.getAsync(A)
                ).to.eventually.be.rejectedWith(
                    HaywireContainerValidationError,
                    'Providers missing for container: A'
                );

                await expect(
                    // @ts-expect-error
                    asyncContainer.getAsync(identifier<B>())
                ).to.eventually.be.rejectedWith(
                    HaywireContainerValidationError,
                    'Providers missing for container: haywire-id'
                );
            });
        });

        suite('Circular dependencies', () => {
            test('Direct dependency', () => {
                const container = createContainer(
                    createModule(
                        bind(identifier(LinkedList).undefinable())
                            .withDependencies([identifier(LinkedList).nullable().undefinable()])
                            .withAsyncProvider(async next => new LinkedList(next))
                    )
                        .addBinding(
                            bind(Chicken).withDependencies([Egg, B]).withConstructorProvider()
                        )
                        .addBinding(bind(Egg).withDependencies([Chicken]).withConstructorProvider())
                        .addBinding(bind(A).withDependencies([Chicken]).withConstructorProvider())
                        .addBinding(bind(B).withConstructorGenerator())
                );
                expect(() => {
                    container.wire();
                })
                    .to.throw(HaywireCircularDependencyError)
                    .that.contains({
                        message: [
                            'Circular dependencies detected in container:',
                            ['Chicken->Egg', 'LinkedList(nullable, undefinable)'].join(', '),
                        ].join(' '),
                    });
            });

            test('Depends on supplier', () => {
                const container = createContainer(
                    createModule(
                        bind(identifier(LinkedList).undefinable())
                            .withDependencies([
                                identifier(LinkedList).undefinable().supplier({
                                    sync: true,
                                    propagateScope: true,
                                }),
                            ])
                            .withProvider(next => new LinkedList(next()))
                            .scoped(requestScope)
                    )
                        .addBinding(
                            bind(Egg)
                                .withProvider(
                                    (chickenSupplier: Supplier<Chicken>) =>
                                        new Egg(chickenSupplier())
                                )
                                .withDependencies([identifier(Chicken).supplier()])
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(Chicken).withDependencies([Egg, B]).withConstructorProvider()
                        )
                        .addBinding(
                            bind(Chicken)
                                .withDependencies([
                                    identifier(Egg).supplier('async').named('AsyncSupplier'),
                                ])
                                .withAsyncProvider(
                                    async eggSupplier => new Chicken(await eggSupplier())
                                )
                                .named('AsyncSupplier')
                        )
                        .addBinding(
                            bind(identifier(Egg).named('AsyncSupplier'))
                                .withDependencies([identifier(Chicken).named('AsyncSupplier')])
                                .withConstructorProvider()
                        )
                        .addBinding(
                            bind(A)
                                .withDependencies([
                                    B,
                                    Chicken,
                                    identifier(LinkedList).undefinable(),
                                ])
                                .withConstructorProvider()
                        )
                        .addBinding(bind(B).withConstructorGenerator())
                );
                expect(() => {
                    container.wire();
                })
                    .to.throw(HaywireCircularDependencyError)
                    .that.contains({
                        message: [
                            'Circular dependencies detected in container:',
                            [
                                'Chicken(named: AsyncSupplier)->Egg(named: AsyncSupplier, supplier(async))',
                                'Chicken(supplier(sync))->Egg',
                                'LinkedList(undefinable, supplier(sync, propagating))',
                            ].join(', '),
                        ].join(' '),
                    });
            });

            test('Suppliers do not propagate request scope', async () => {
                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([identifier(B).lateBinding()])
                            .withConstructorProvider()
                    )
                        .addBinding(
                            bind(B)
                                .withDependencies([
                                    // Propagates scope, but no request scope
                                    identifier(A).supplier({
                                        sync: false,
                                        propagateScope: true,
                                    }),
                                    identifier(C).supplier({
                                        sync: false,
                                        propagateScope: true,
                                    }),
                                ])
                                .withConstructorProvider()
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([
                                    identifier(A),
                                    identifier(D),
                                    identifier(E).supplier('async'),
                                ])
                                .withConstructorProvider()
                                .scoped(requestScope)
                        )
                        .addBinding(
                            // Propagates scope, but uses supplier scope
                            bind(D)
                                .withDependencies([
                                    identifier(A).supplier({
                                        sync: true,
                                        propagateScope: true,
                                    }),
                                ])
                                .withConstructorProvider()
                                .scoped(supplierScope)
                        )
                        .addBinding(bind(E).withDependencies([A, F]).withConstructorProvider())
                        .addBinding(
                            bind(F)
                                .withDependencies([A])
                                .withConstructorProvider()
                                .scoped(optimisticSingletonScope)
                        )
                );

                expect(() => {
                    container.wire();
                })
                    .to.throw(HaywireCircularDependencyError)
                    .that.contains({
                        message: [
                            'Circular dependencies detected in container:',
                            [
                                'A->B(late-binding)->C(supplier(async, propagating))->E(supplier(async))',
                                'A(supplier(async, propagating))->B(late-binding)',
                                'A(supplier(sync, propagating))->B(late-binding)->C(supplier(async, propagating))->D',
                            ].join(', '),
                        ].join(' '),
                    });
            });

            test('Contains some acceptable loops', async () => {
                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([identifier(B).lateBinding()])
                            .withConstructorProvider()
                            .scoped(singletonScope)
                    )
                        .addBinding(bind(B).withDependencies([C]).withConstructorProvider())
                        .addBinding(
                            bind(C)
                                .withDependencies([
                                    identifier(B).nullable().lateBinding(),
                                    identifier(D).lateBinding(),
                                    identifier(E).supplier(),
                                ])
                                .withConstructorProvider()
                        )
                        .addBinding(bind(D).withDependencies([A]).withConstructorProvider())
                        .addBinding(
                            bind(E)
                                .withDependencies([
                                    identifier(A).supplier(),
                                    identifier(B).undefinable(),
                                ])
                                .withConstructorProvider()
                        )
                );

                expect(() => {
                    container.wire();
                })
                    .to.throw(HaywireCircularDependencyError)
                    .that.contains({
                        message:
                            'Circular dependencies detected in container: B(undefinable)->C->E(supplier(sync))',
                    });
            });
        });

        suite('Sync providers', () => {
            test('Provider is async', async () => {
                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([
                                identifier(B).supplier(),
                                identifier(C).supplier(),
                                identifier(E).supplier(),
                            ])
                            .withConstructorProvider()
                    )
                        .addBinding(
                            bind(B)
                                .withDependencies([])
                                .withAsyncProvider(async () => new B())
                        )
                        .addBinding(bind(C).withDependencies([D]).withConstructorProvider())
                        .addBinding(
                            bind(D)
                                .withAsyncProvider(() => new D())
                                .withDependencies([])
                        )
                        .addBinding(
                            bind(E)
                                .withDependencies([identifier(F).lateBinding()])
                                .withProvider(() => new E())
                        )
                        .addBinding(
                            bind(F)
                                .withAsyncProvider(() => new F())
                                .withDependencies([])
                        )
                );

                expect(() => {
                    container.wire();
                })
                    .to.throw(HaywireSyncSupplierError)
                    .that.contains({
                        message: [
                            'Binding has dependency on syncronous supplier that must be async:',
                            [
                                '[output id: B, dependency supplier id: B(supplier(sync))]',
                                '[output id: C, dependency supplier id: C(supplier(sync))]',
                                '[output id: E, dependency supplier id: E(supplier(sync))]',
                            ].join(', '),
                        ].join(' '),
                    });
            });

            test('Singletons are not optimistic', async () => {
                const container = createContainer(
                    createModule(bind(A).withDependencies([B, C, D, E]).withConstructorProvider())
                        .addBinding(
                            bind(B)
                                .withDependencies([])
                                .withAsyncProvider(async () => new B())
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([D])
                                .withAsyncProvider(() => new C())
                                .scoped(requestScope)
                        )
                        .addBinding(
                            bind(D)
                                .withAsyncProvider(async () => new D())
                                .withDependencies([])
                                .scoped(optimisticRequestScope)
                        )
                        .addBinding(
                            bind(E)
                                .withDependencies([
                                    identifier(B).supplier(),
                                    identifier(C).supplier({
                                        sync: true,
                                        propagateScope: true,
                                    }),
                                    identifier(D).supplier({
                                        sync: true,
                                        propagateScope: false,
                                    }),
                                ])
                                .withConstructorProvider()
                        )
                );

                expect(() => {
                    container.wire();
                })
                    .to.throw(HaywireSyncSupplierError)
                    .that.contains({
                        message: [
                            'Binding has dependency on syncronous supplier that must be async:',
                            [
                                '[output id: B, dependency supplier id: B(supplier(sync))]',
                                '[output id: C, dependency supplier id: C(supplier(sync, propagating))]',
                                '[output id: D, dependency supplier id: D(supplier(sync))]',
                            ].join(', '),
                        ].join(' '),
                    });
            });
        });

        suite('Response validation', () => {
            test('Returns null', async () => {
                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([B, identifier(C).undefinable()])
                            .withConstructorProvider()
                    )
                        .addBinding(
                            bind(B)
                                .withDependencies([])
                                .withProvider(() => null as unknown as B)
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([])
                                .withProvider(() => null as unknown as C)
                                .scoped(requestScope)
                        )
                );

                container.preload();

                expect(() => container.get(A))
                    .to.throw(HaywireNullResponseError)
                    .that.contains({
                        message: 'Null value returned for non-nullable provider: B',
                    });

                await expect(container.getAsync(A))
                    .to.eventually.be.rejectedWith(HaywireNullResponseError)
                    .that.contain({
                        message: 'Null value returned for non-nullable provider: B',
                    });

                const asyncContainer = createContainer(
                    createModule(
                        bind(D)
                            .withAsyncGenerator(() => null as unknown as D)
                            .undefinable()
                            .scoped(optimisticSingletonScope)
                    )
                );
                asyncContainer.wire();

                await expect(asyncContainer.preloadAsync())
                    .to.eventually.be.rejectedWith(HaywireNullResponseError)
                    .that.contain({
                        message: 'Null value returned for non-nullable provider: D(undefinable)',
                    });
            });

            test('Returns undefined', async () => {
                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([
                                B,
                                identifier(B).named('sync'),
                                identifier(C).nullable(),
                            ])
                            .withAsyncProvider(() => new A())
                    )
                        .addBinding(
                            bind(B)
                                .withDependencies([])
                                .withAsyncProvider(async () => undefined as unknown as B)
                        )
                        .addBinding(
                            bind(B)
                                .withGenerator(() => undefined as unknown as B)
                                .named('sync')
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([identifier(D).undefinable(), E])
                                .withConstructorProvider()
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(D)
                                .withDependencies([])
                                .withProvider(() => null as unknown as D)
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(E)
                                .withDependencies([])
                                .withAsyncProvider(async () => {
                                    throw '<ERROR>';
                                })
                                .scoped(singletonScope)
                        )
                );

                await container.preloadAsync();

                await expect(container.getAsync(A))
                    .to.eventually.be.rejectedWith(HaywireMultiError)
                    .that.contain({
                        message: [
                            'Multiple errors: [',
                            [
                                'Undefined value returned for non-undefinable provider: B',
                                'Undefined value returned for non-undefinable provider: B(named: sync)',
                                'Null value returned for non-nullable provider: D',
                                '<ERROR>',
                            ].join(', '),
                            ']',
                        ].join(''),
                    });
            });

            test('Returns wrong instanceof', async () => {
                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([
                                identifier(B).nullable().undefinable().supplier({
                                    sync: false,
                                    propagateScope: true,
                                }),
                            ])
                            .withConstructorProvider()
                            .scoped(singletonScope)
                    )
                        .addBinding(bind(B).withDependencies([C, D]).withConstructorProvider())
                        .addBinding(bind(C).withDependencies([D]).withConstructorProvider())
                        .addBinding(
                            bind(D)
                                .withDependencies([])
                                .withProvider(() => new E() as unknown as D)
                                .scoped(requestScope)
                        )
                );

                await container.preloadAsync();

                const a = container.get(A);
                const bSupplier = a.params[0] as AsyncSupplier<B | null | undefined>;

                const settled = await Promise.allSettled([bSupplier(), bSupplier()] as const);
                expect(settled.every(result => result.status === 'rejected')).to.equal(true);
                const failures = settled as [PromiseRejectedResult, PromiseRejectedResult];
                expect(failures[0].reason)
                    .to.be.an.instanceOf(HaywireInstanceOfResponseError)
                    .that.contains({
                        message: 'Value E returned by provider is not instance of class: D',
                    });
                expect(failures[1].reason)
                    .to.be.an.instanceOf(HaywireInstanceOfResponseError)
                    .that.contains({
                        message: 'Value E returned by provider is not instance of class: D',
                    });
                // Sync error -> no caching
                expect(failures[0].reason !== failures[1].reason).to.equal(true);

                await expect(bSupplier())
                    .to.eventually.be.rejectedWith(HaywireInstanceOfResponseError)
                    .that.does.not.equal(failures[0].reason);

                const failedContainer = createContainer(
                    createModule(
                        bind(D)
                            .withDependencies([E])
                            .withAsyncProvider(() => ({ d: false }) as unknown as D)
                            .scoped(optimisticSingletonScope)
                    ).addBinding(bind(E).withConstructorGenerator())
                );
                failedContainer.wire();
                await expect(failedContainer.preloadAsync())
                    .to.be.rejectedWith(HaywireInstanceOfResponseError)
                    .that.eventually.contain({
                        message:
                            'Value {"d":false} returned by provider is not instance of class: D',
                    });
                await expect(failedContainer.getAsync(E)).to.be.rejectedWith(
                    HaywireInstanceOfResponseError
                );
            });

            test('Binding does not exist', async () => {
                const container = createContainer(
                    createModule(bind(identifier<123>()).withInstance(123))
                );

                expect(() => container.get(identifier<123>('custom-name')))
                    .to.throw(HaywireProviderMissingError)
                    .that.contains({
                        message: 'Providers missing for container: custom-name',
                    });
                await expect(container.getAsync(identifier<123>())).to.eventually.be.rejectedWith(
                    HaywireProviderMissingError
                );
            });
        });
    });

    suite('Scope caching', () => {
        test('Async errors are temporarily cached', async () => {
            const aSupplier = identifier<{
                supply: AsyncSupplier<A>;
            }>();

            const container = createContainer(
                createModule(
                    bind(aSupplier)
                        .withDependencies([
                            identifier(A).supplier({
                                sync: false,
                                propagateScope: true,
                            }),
                        ])
                        .withProvider(supply => ({ supply }))
                )
                    .addBinding(
                        bind(A)
                            .withDependencies([B, C])
                            .withConstructorProvider()
                            .scoped(requestScope)
                    )
                    .addBinding(
                        bind(B)
                            .withGenerator(() => 123 as unknown as B)
                            .scoped(singletonScope)
                    )
                    .addBinding(
                        bind(C)
                            .withAsyncGenerator(async () => {
                                await setTimeout(5);
                                throw new Error('Bad C');
                            })
                            .scoped(singletonScope)
                    )
            );

            const { supply } = await container.getAsync(aSupplier);

            const settled = await Promise.allSettled([
                supply(),
                supply(),
                container.getAsync(B),
                container.getAsync(C),
            ]);

            expect(settled.every(settle => settle.status === 'rejected')).to.equal(true);
            const errors = (settled as PromiseRejectedResult[]).map(
                ({ reason }) => reason as Error
            );

            // First two errors are the exact same, because A was temporarily cached
            expect(errors[0]).to.be.an.instanceOf(HaywireMultiError);
            expect(errors[0]).to.eq(errors[1]);

            const { causes } = errors[0] as HaywireMultiError;

            // Causes are related to B + C failures
            expect(causes[0]).to.be.an.instanceOf(HaywireInstanceOfResponseError).that.contains({
                message: 'Value 123 returned by provider is not instance of class: B',
            });
            expect(causes[1]).to.be.an.instanceOf(Error).that.contains({
                message: 'Bad C',
            });

            // Invoking B + C result in same looking errors
            expect(errors[2]).to.be.an.instanceOf(HaywireInstanceOfResponseError).that.contains({
                message: 'Value 123 returned by provider is not instance of class: B',
            });
            expect(errors[3]).to.be.an.instanceOf(Error).that.contains({
                message: 'Bad C',
            });

            // B is not cached because it is sync
            expect(causes[0]).to.not.equal(errors[2]);
            // C is cached because it is async
            expect(causes[1]).to.equal(errors[3]);

            const secondSettled = await Promise.allSettled([supply(), container.getAsync(C)]);

            expect(secondSettled.every(settle => settle.status === 'rejected')).to.equal(true);
            const secondErrors = (secondSettled as PromiseRejectedResult[]).map(
                ({ reason }) => reason as Error
            );

            // A+C's failures were removed from cache
            expect(secondErrors[0]).to.not.equal(errors[0]);
            expect(secondErrors[1]).to.not.equal(errors[1]);
        });

        suite('Late binding failures will evict from cache', () => {
            test('sync', async () => {
                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([
                                identifier(B).lateBinding(),
                                identifier(C).lateBinding(),
                            ])
                            .withConstructorProvider()
                            .scoped(singletonScope)
                    )
                        .addBinding(bind(B).withConstructorGenerator().scoped(singletonScope))
                        .addBinding(
                            bind(C)
                                .withDependencies([identifier(D).lateBinding()])
                                .withProvider(() => new C())
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(D)
                                .withDependencies([identifier(E).lateBinding()])
                                .withProvider(() => new D())
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(E)
                                .withDependencies([identifier(F).lateBinding()])
                                .withProvider(() => new E())
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(F)
                                .withGenerator(() => Object.create(null) as F)
                                .scoped(singletonScope)
                        )
                );

                const b = container.get(B);

                const throwns = await Promise.all([
                    catchThrown(() => container.get(A)),
                    catchThrown(() => container.get(A)),
                ]);
                expect(throwns[0])
                    .to.be.an.instanceOf(HaywireInstanceOfResponseError)
                    .that.contains({
                        message: 'Value {} returned by provider is not instance of class: F',
                    });
                expect(throwns[1]).to.be.an.instanceOf(HaywireInstanceOfResponseError);
                expect(throwns[0]).to.not.equal(throwns[1]);
                expect(() => container.get(A))
                    .to.throw(HaywireInstanceOfResponseError)
                    .that.does.not.equal(throwns[0]);

                expect(container.get(B)).to.equal(b);
            });

            test('async', async () => {
                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([
                                identifier(B).lateBinding(),
                                identifier(C).lateBinding(),
                            ])
                            .withConstructorProvider()
                            .scoped(singletonScope)
                    )
                        .addBinding(
                            bind(B)
                                .withAsyncGenerator(async () => new B())
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([identifier(D).lateBinding()])
                                .withProvider(() => new C())
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(D)
                                .withDependencies([identifier(E).lateBinding()])
                                .withProvider(() => new D())
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(E)
                                .withDependencies([identifier(F).lateBinding()])
                                .withProvider(() => new E())
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(F)
                                .withAsyncGenerator(async () => {
                                    throw new Error('<ERROR>');
                                })
                                .scoped(singletonScope)
                        )
                );

                const b = await container.getAsync(B);

                const throwns = await Promise.all([
                    catchThrown(async () => container.getAsync(A)),
                    catchThrown(async () => container.getAsync(A)),
                ]);
                expect(throwns[0]).to.contain({ message: '<ERROR>' });
                expect(throwns[0]).to.equal(throwns[1]);
                await expect(container.getAsync(A))
                    .to.eventually.be.rejectedWith(Error)
                    .that.does.not.equal(throwns[0]);

                expect(await container.getAsync(B)).to.equal(b);
            });
        });

        test('Propagate scope shares request', async () => {
            const supplierId = identifier<{
                supplyA: Supplier<A>;
                supplyB: AsyncSupplier<B>;
                c: C;
                d: D;
            }>();

            const container = createContainer(
                createModule(
                    bind(supplierId)
                        .withDependencies([
                            identifier(A).supplier({
                                sync: true,
                                propagateScope: true,
                            }),
                            identifier(B).supplier({
                                sync: false,
                                propagateScope: true,
                            }),
                            C,
                            D,
                        ])
                        .withProvider((supplyA, supplyB, c, d) => ({
                            supplyA,
                            supplyB,
                            c,
                            d,
                        }))
                )
                    .addBinding(
                        bind(A)
                            .withDependencies([C])
                            .withAsyncProvider(async c => new A(c))
                            .scoped(optimisticRequestScope)
                    )
                    .addBinding(
                        bind(B).withDependencies([D]).withConstructorProvider().scoped(requestScope)
                    )
                    .addBinding(bind(C).withConstructorGenerator().scoped(requestScope))
                    .addBinding(bind(D).withConstructorGenerator().scoped(optimisticRequestScope))
            );

            const supplier = await container.getAsync(supplierId);

            const a = supplier.supplyA();
            expect(a).to.be.an.instanceOf(A);
            expect(a).to.equal(supplier.supplyA());
            expect(a).to.not.equal(await container.getAsync(A));

            const b = await supplier.supplyB();
            expect(b).to.equal(await supplier.supplyB());

            expect(supplier.c).to.equal(a.params[0]);
            expect(supplier.d).to.equal(b.params[0]);
        });

        test('Supplier scope opts out of request', async () => {
            const supplierId = identifier<{
                supplyA: Supplier<A>;
                supplyB: AsyncSupplier<B>;
                c: C;
                d: D;
                e: E;
                f: F;
            }>();

            const container = createContainer(
                createModule(
                    bind(supplierId)
                        .withDependencies([
                            identifier(A).supplier({
                                sync: true,
                                propagateScope: true,
                            }),
                            identifier(B).supplier({
                                sync: false,
                                propagateScope: true,
                            }),
                            C,
                            D,
                            E,
                            F,
                        ])
                        .withAsyncProvider((supplyA, supplyB, c, d, e, f) => ({
                            supplyA,
                            supplyB,
                            c,
                            d,
                            e,
                            f,
                        }))
                )
                    .addBinding(
                        bind(A)
                            .withDependencies([C, E, F])
                            .withConstructorProvider()
                            .scoped(supplierScope)
                    )
                    .addBinding(
                        bind(B)
                            .withDependencies([D, E, F])
                            .withConstructorProvider()
                            .scoped(supplierScope)
                    )
                    .addBinding(
                        bind(C)
                            .withDependencies([E])
                            .withAsyncProvider(e => new C(e))
                            .scoped(optimisticRequestScope)
                    )
                    .addBinding(
                        bind(D).withDependencies([E]).withConstructorProvider().scoped(requestScope)
                    )
                    .addBinding(bind(E).withDependencies([F]).withConstructorProvider())
                    .addBinding(bind(F).withConstructorGenerator().scoped(supplierScope))
            );

            const supplier = await container.getAsync(supplierId);

            expect(supplier.supplyA()).to.not.equal(supplier.supplyA());
            expect(await supplier.supplyB()).to.not.equal(await supplier.supplyB());

            const aParams = supplier.supplyA().params as [C, E, F];
            expect(aParams[0]).to.equal(supplier.c);
            const b = await supplier.supplyB();
            const bParams = b.params as [D, E, F];
            expect(bParams[0]).to.equal(supplier.d);

            expect(aParams[1].params[0]).to.equal(aParams[2]);
            expect(bParams[1].params[0]).to.equal(bParams[2]);

            expect(supplier.f).to.not.equal(aParams[2]);
            expect(supplier.f).to.not.equal(bParams[2]);
        });

        suite('Optimistic singletons are available immediately', () => {
            test('Async component', async () => {
                const supplierId = identifier<{
                    aSupplier: Supplier<A>;
                    bSupplier: Supplier<B>;
                    cSupplier: Supplier<C>;
                }>();

                const container = createContainer(
                    createModule(
                        bind(supplierId)
                            .withDependencies([
                                identifier(A).supplier(),
                                identifier(B).supplier(),
                                identifier(C).supplier(),
                            ])
                            .withAsyncProvider((aSupplier, bSupplier, cSupplier) => ({
                                aSupplier,
                                bSupplier,
                                cSupplier,
                            }))
                    )
                        .addBinding(
                            bind(A)
                                .withDependencies([
                                    identifier(B).supplier(),
                                    identifier(C).supplier('async'),
                                ])
                                .withAsyncProvider(
                                    async (bSupplier, cSupplier) =>
                                        new A(bSupplier(), await cSupplier())
                                )
                                .scoped(optimisticSingletonScope)
                        )
                        .addBinding(
                            bind(B)
                                .withDependencies([
                                    identifier(C).supplier(),
                                    identifier(B).lateBinding(),
                                ])
                                .withAsyncProvider((cSupplier, lateB) => new B(cSupplier(), lateB))
                                .scoped(optimisticSingletonScope)
                        )
                        .addBinding(
                            bind(C)
                                .withAsyncGenerator(() => new C())
                                .scoped(optimisticSingletonScope)
                        )
                );

                const supplier = await container.getAsync(supplierId);
                expect(await container.getAsync(supplierId)).to.not.equal(supplier);

                expect(supplier.aSupplier()).to.equal(await container.getAsync(A));
                expect(supplier.bSupplier()).to.equal(await container.getAsync(B));
                expect(supplier.cSupplier()).to.equal(await container.getAsync(C));

                expect(supplier.aSupplier().params[0]).to.equal(supplier.bSupplier());
                expect(supplier.aSupplier().params[1]).to.equal(supplier.cSupplier());
                expect(supplier.bSupplier().params[0]).to.equal(supplier.cSupplier());
                expect(await supplier.bSupplier().params[1]).to.equal(await container.getAsync(B));
            });

            test('Sync component', async () => {
                const supplierId = identifier<{
                    aSupplier: AsyncSupplier<A>;
                    bSupplier: AsyncSupplier<B>;
                    cSupplier: AsyncSupplier<C>;
                }>();

                const container = createContainer(
                    createModule(
                        bind(supplierId)
                            .withDependencies([
                                identifier(A).supplier('async'),
                                identifier(B).supplier('async'),
                                identifier(C).supplier('async'),
                            ])
                            .withProvider((aSupplier, bSupplier, cSupplier) => ({
                                aSupplier,
                                bSupplier,
                                cSupplier,
                            }))
                    )
                        .addBinding(
                            bind(A)
                                .withDependencies([
                                    identifier(B).supplier(),
                                    identifier(C).supplier(),
                                ])
                                .withProvider((bSupplier, cSupplier) => {
                                    const b = bSupplier();
                                    const c = cSupplier();
                                    expect(b).to.be.an.instanceOf(B);
                                    expect(b).to.equal(bSupplier());
                                    expect(c).to.be.an.instanceOf(C);
                                    expect(c).to.equal(cSupplier());
                                    return new A(b, c);
                                })
                                .scoped(optimisticSingletonScope)
                        )
                        .addBinding(
                            bind(B)
                                .withDependencies([identifier(C).supplier()])
                                .withProvider(cSupplier => {
                                    const c = cSupplier();
                                    expect(c).to.be.an.instanceOf(C);
                                    expect(c).to.equal(cSupplier());
                                    return new B(c);
                                })
                                .scoped(optimisticSingletonScope)
                        )
                        .addBinding(
                            bind(C)
                                .withGenerator(() => new C())
                                .scoped(optimisticSingletonScope)
                        )
                );

                const supplier = container.get(supplierId);
                expect(container.get(supplierId)).to.not.equal(supplier);

                expect(await supplier.aSupplier()).to.equal(container.get(A));
                expect(await supplier.bSupplier()).to.equal(container.get(B));
                expect(await supplier.cSupplier()).to.equal(container.get(C));

                const suppliedA1 = await supplier.aSupplier();
                expect(suppliedA1.params[0]).to.equal(await supplier.bSupplier());
                const suppliedA2 = await supplier.aSupplier();
                expect(suppliedA2.params[1]).to.equal(await supplier.cSupplier());
                const suppliedB = await supplier.bSupplier();
                expect(suppliedB.params[0]).to.equal(await supplier.cSupplier());
            });
        });

        test('Request singletons are available immediately', async () => {
            const supplierId = identifier<{
                aSupplier: Supplier<A>;
                bSupplier: Supplier<B>;
                cSupplier: Supplier<C>;
            }>();

            const container = createContainer(
                createModule(
                    bind(supplierId)
                        .withDependencies([
                            identifier(A).supplier({
                                sync: true,
                                propagateScope: true,
                            }),
                            identifier(B).supplier({
                                sync: true,
                                propagateScope: true,
                            }),
                            identifier(C).supplier({
                                sync: true,
                                propagateScope: true,
                            }),
                        ])
                        .withAsyncProvider((aSupplier, bSupplier, cSupplier) => ({
                            aSupplier,
                            bSupplier,
                            cSupplier,
                        }))
                )
                    .addBinding(
                        bind(A)
                            .withDependencies([
                                identifier(B).supplier({
                                    sync: true,
                                    propagateScope: true,
                                }),
                                identifier(C).supplier({
                                    sync: true,
                                    propagateScope: true,
                                }),
                            ])
                            .withAsyncProvider(
                                (bSupplier, cSupplier) => new A(bSupplier(), cSupplier())
                            )
                            .scoped(optimisticRequestScope)
                    )
                    .addBinding(
                        bind(B)
                            .withDependencies([
                                identifier(C).supplier({
                                    sync: true,
                                    propagateScope: true,
                                }),
                            ])
                            .withAsyncProvider(cSupplier => new B(cSupplier()))
                            .scoped(optimisticRequestScope)
                    )
                    .addBinding(
                        bind(C)
                            .withAsyncGenerator(() => new C())
                            .scoped(optimisticRequestScope)
                    )
            );

            const supplier = await container.getAsync(supplierId);
            expect(await container.getAsync(supplierId)).to.not.equal(supplier);

            expect(supplier.aSupplier()).to.be.an.instanceOf(A);
            expect(supplier.bSupplier()).to.be.an.instanceOf(B);
            expect(supplier.cSupplier()).to.be.an.instanceOf(C);

            expect(supplier.aSupplier()).to.equal(supplier.aSupplier());
            expect(supplier.bSupplier()).to.equal(supplier.bSupplier());
            expect(supplier.cSupplier()).to.equal(supplier.cSupplier());

            expect(supplier.aSupplier().params[0]).to.equal(supplier.bSupplier());
            expect(supplier.aSupplier().params[1]).to.equal(supplier.cSupplier());
            expect(supplier.bSupplier().params[0]).to.equal(supplier.cSupplier());
        });

        test('Request singletons are available before async supplier', async () => {
            const dSupplierIdentifier = identifier<{
                dSupplier: AsyncSupplier<D>;
            }>();

            const container = createContainer(
                createModule(
                    bind(A)
                        .withDependencies([
                            identifier(B).supplier({
                                sync: false,
                                propagateScope: true,
                            }),
                            identifier(D).supplier({
                                sync: false,
                                propagateScope: true,
                            }),
                        ])
                        .withConstructorProvider()
                        .scoped(supplierScope)
                )
                    .addBinding(
                        bind(B)
                            .withDependencies([
                                identifier(C).supplier({
                                    sync: true,
                                    propagateScope: true,
                                }),
                            ])
                            .withConstructorProvider()
                            .scoped(optimisticRequestScope)
                    )
                    .addBinding(
                        bind(C)
                            .withGenerator(() => {
                                throw new Error('<ERROR>');
                            })
                            .scoped(optimisticRequestScope)
                    )
                    .addBinding(
                        bind(D)
                            .withDependencies([
                                identifier(E).supplier({
                                    sync: true,
                                    propagateScope: true,
                                }),
                            ])
                            .withConstructorProvider()
                            .scoped(optimisticRequestScope)
                    )
                    .addBinding(
                        bind(E)
                            .withAsyncGenerator(async () => new E())
                            .scoped(optimisticRequestScope)
                    )
                    .addBinding(
                        bind(dSupplierIdentifier)
                            .withDependencies([identifier(D).supplier('async')])
                            .withProvider(dSupplier => ({ dSupplier }))
                    )
            );

            await expect(container.getAsync(A)).to.eventually.be.rejectedWith(Error).that.contain({
                message: '<ERROR>',
            });

            const { dSupplier } = await container.getAsync(dSupplierIdentifier);
            const d = await dSupplier();
            const eSupplier = d.params[0] as Supplier<E>;

            expect(eSupplier()).to.be.an.instanceOf(E);
            expect(eSupplier()).to.equal(eSupplier());
        });

        suite('Supplier scope opts out of request context', () => {
            test('Sync component', async () => {
                const supplierIdentifier = identifier<{
                    aSupplier: Supplier<A>;
                    aSupplierAsync: AsyncSupplier<A>;
                }>();

                const container = createContainer(
                    createModule(
                        bind(supplierIdentifier)
                            .withDependencies([
                                identifier(A).supplier({
                                    sync: true,
                                    propagateScope: true,
                                }),
                                identifier(A).supplier({
                                    sync: false,
                                    propagateScope: true,
                                }),
                            ])
                            .withProvider((aSupplier, aSupplierAsync) => ({
                                aSupplier,
                                aSupplierAsync,
                            }))
                    )
                        .addBinding(
                            bind(A)
                                .withDependencies([B, C, D])
                                .withProvider((...params) => new A(...params))
                        )
                        .addBinding(
                            bind(B)
                                .withDependencies([C, D])
                                .withProvider((...params) => new B(...params))
                        )
                        .addBinding(
                            bind(C)
                                .withGenerator(() => new C())
                                .scoped(supplierScope)
                        )
                        .addBinding(
                            bind(D)
                                .withGenerator(() => new D())
                                .scoped(requestScope)
                        )
                );

                const { aSupplier, aSupplierAsync } = await container.getAsync(supplierIdentifier);

                for (const supplier of [aSupplier, aSupplierAsync]) {
                    const a1 = await supplier();
                    const b = a1.params[0] as B;
                    expect(await supplier()).to.not.equal(a1);
                    const a2 = await supplier();
                    expect(a2.params[0]).to.not.equal(b);

                    // C is cached across supplier call
                    expect(a1.params[1]).to.equal(b.params[0]);
                    // But not across different requests
                    const a3 = await supplier();
                    expect(a3.params[1]).to.not.equal(a1.params[1]);

                    // D is cached across all calls
                    expect(a1.params[2]).to.equal(b.params[1]);
                    const a4 = await supplier();
                    expect(a4.params[2]).to.equal(a1.params[2]);
                }
            });

            test('Async component', async () => {
                const supplierIdentifier = identifier<{
                    aSupplierAsync: AsyncSupplier<A>;
                }>();

                const container = createContainer(
                    createModule(
                        bind(supplierIdentifier)
                            .withDependencies([
                                identifier(A).supplier({
                                    sync: false,
                                    propagateScope: true,
                                }),
                            ])
                            .withAsyncProvider(aSupplierAsync => ({
                                aSupplierAsync,
                            }))
                    )
                        .addBinding(
                            bind(A)
                                .withDependencies([B, C, D])
                                .withAsyncProvider((...params) => new A(...params))
                        )
                        .addBinding(
                            bind(B)
                                .withDependencies([C, D])
                                .withAsyncProvider((...params) => new B(...params))
                        )
                        .addBinding(
                            bind(C)
                                .withAsyncGenerator(() => new C())
                                .scoped(supplierScope)
                        )
                        .addBinding(
                            bind(D)
                                .withAsyncGenerator(() => new D())
                                .scoped(requestScope)
                        )
                );

                const { aSupplierAsync } = await container.getAsync(supplierIdentifier);

                const a = await aSupplierAsync();
                const b = a.params[0] as B;
                expect(await aSupplierAsync()).to.not.equal(a);
                const supplied1 = await aSupplierAsync();
                expect(supplied1.params[0]).to.not.equal(b);

                // C is cached across supplier call
                expect(a.params[1]).to.equal(b.params[0]);
                // But not across different requests
                const supplied2 = await aSupplierAsync();
                expect(supplied2.params[1]).to.not.equal(a.params[1]);

                // D is cached across all calls
                expect(a.params[2]).to.equal(b.params[1]);
                const supplied3 = await aSupplierAsync();
                expect(supplied3.params[2]).to.equal(a.params[2]);
            });
        });

        suite('Supplier scope propagates supplier request', () => {
            test('Sync component', () => {
                const aSupplierIdentifier = identifier<{
                    aSupplier: Supplier<A>;
                }>();

                const cSupplierIdentifier = identifier<{
                    cSupplier: Supplier<C>;
                }>();

                const container = createContainer(
                    createModule(
                        bind(aSupplierIdentifier)
                            .withDependencies([
                                identifier(A).supplier({
                                    sync: true,
                                    propagateScope: true,
                                }),
                            ])
                            .withProvider(aSupplier => ({ aSupplier }))
                    )
                        .addBinding(
                            bind(A)
                                .withDependencies([
                                    B,
                                    C,
                                    cSupplierIdentifier,
                                    cSupplierIdentifier,
                                    cSupplierIdentifier.named('request'),
                                ])
                                .withConstructorProvider()
                        )
                        .addBinding(bind(B).withConstructorGenerator().scoped(requestScope))
                        .addBinding(
                            bind(cSupplierIdentifier)
                                .withDependencies([
                                    identifier(C).supplier({
                                        sync: true,
                                        propagateScope: true,
                                    }),
                                ])
                                .withProvider(cSupplier => ({ cSupplier }))
                                .scoped(supplierScope)
                        )
                        .addBinding(
                            bind(cSupplierIdentifier.named('request'))
                                .withDependencies([
                                    identifier(C).supplier({
                                        sync: true,
                                        propagateScope: true,
                                    }),
                                ])
                                .withProvider(cSupplier => ({ cSupplier }))
                                .scoped(requestScope)
                        )
                        .addBinding(bind(C).withConstructorGenerator().scoped(requestScope))
                );

                for (const { aSupplier, viaASupplier } of [
                    {
                        aSupplier: container.get(aSupplierIdentifier).aSupplier,
                        viaASupplier: true,
                    },
                    {
                        aSupplier: () => container.get(A),
                        viaASupplier: false,
                    },
                ]) {
                    const a = aSupplier();
                    expect(a).to.not.equal(aSupplier());

                    const [b] = aSupplier().params;
                    expect(b).to.be.an.instanceOf(B);
                    if (viaASupplier) {
                        expect(b).to.equal(aSupplier().params[0]);
                    } else {
                        expect(b).to.not.equal(aSupplier().params[0]);
                    }

                    const { cSupplier: cSupplier1 } = a.params[2] as HaywireIdType<
                        typeof cSupplierIdentifier
                    >;
                    const { cSupplier: cSupplier2 } = a.params[3] as HaywireIdType<
                        typeof cSupplierIdentifier
                    >;
                    const { cSupplier: cSupplier3 } = a.params[4] as HaywireIdType<
                        typeof cSupplierIdentifier
                    >;

                    expect(cSupplier1()).to.be.an.instanceOf(C);
                    expect(cSupplier3()).to.be.an.instanceOf(C);
                    expect(a.params[1]).to.be.an.instanceOf(C);

                    expect(cSupplier1()).to.equal(cSupplier1());
                    expect(cSupplier1()).to.equal(cSupplier2());
                    if (viaASupplier) {
                        expect(cSupplier1()).to.not.equal(cSupplier3());
                        expect(cSupplier1()).to.not.equal(a.params[1]);
                    } else {
                        expect(cSupplier1()).to.equal(cSupplier3());
                        expect(cSupplier1()).to.equal(a.params[1]);
                    }

                    if (viaASupplier) {
                        expect(aSupplier().params[1]).to.equal(a.params[1]);
                    } else {
                        expect(aSupplier().params[1]).to.not.equal(a.params[1]);
                    }
                }
            });

            test('Async component', async () => {
                const aSupplierIdentifier = identifier<{
                    aSupplier: AsyncSupplier<A>;
                }>();

                const cSupplierIdentifier = identifier<{
                    cSupplier: AsyncSupplier<C>;
                }>();

                const container = createContainer(
                    createModule(
                        bind(aSupplierIdentifier)
                            .withDependencies([
                                identifier(A).supplier({
                                    sync: false,
                                    propagateScope: true,
                                }),
                            ])
                            .withAsyncProvider(aSupplier => ({ aSupplier }))
                    )
                        .addBinding(
                            bind(A)
                                .withDependencies([
                                    B,
                                    C,
                                    cSupplierIdentifier,
                                    cSupplierIdentifier,
                                    cSupplierIdentifier.named('request'),
                                ])
                                .withAsyncProvider((...params) => new A(...params))
                        )
                        .addBinding(
                            bind(B)
                                .withAsyncProvider(() => new B())
                                .withDependencies([])
                                .scoped(requestScope)
                        )
                        .addBinding(
                            bind(cSupplierIdentifier)
                                .withDependencies([
                                    identifier(C).supplier({
                                        sync: false,
                                        propagateScope: true,
                                    }),
                                ])
                                .withAsyncProvider(cSupplier => ({ cSupplier }))
                                .scoped(supplierScope)
                        )
                        .addBinding(
                            bind(cSupplierIdentifier.named('request'))
                                .withDependencies([
                                    identifier(C).supplier({
                                        sync: false,
                                        propagateScope: true,
                                    }),
                                ])
                                .withAsyncProvider(cSupplier => ({ cSupplier }))
                                .scoped(requestScope)
                        )
                        .addBinding(
                            bind(C)
                                .withAsyncProvider(() => new C())
                                .withDependencies([])
                                .scoped(requestScope)
                        )
                );

                for (const { aSupplier, viaASupplier } of [
                    await (async () => {
                        const val = await container.getAsync(aSupplierIdentifier);
                        return {
                            aSupplier: val.aSupplier,
                            viaASupplier: true,
                        };
                    })(),
                    {
                        aSupplier: async () => container.getAsync(A),
                        viaASupplier: false,
                    },
                ]) {
                    const a1 = await aSupplier();
                    const a2 = await aSupplier();
                    expect(a1).to.not.equal(a2);

                    const a3 = await aSupplier();
                    const [b] = a3.params;
                    expect(b).to.be.an.instanceOf(B);

                    const a4 = await aSupplier();
                    if (viaASupplier) {
                        expect(b).to.equal(a4.params[0]);
                    } else {
                        expect(b).to.not.equal(a4.params[0]);
                    }

                    const { cSupplier: cSupplier1 } = a1.params[2] as HaywireIdType<
                        typeof cSupplierIdentifier
                    >;
                    const { cSupplier: cSupplier2 } = a1.params[3] as HaywireIdType<
                        typeof cSupplierIdentifier
                    >;
                    const { cSupplier: cSupplier3 } = a1.params[4] as HaywireIdType<
                        typeof cSupplierIdentifier
                    >;

                    expect(await cSupplier1()).to.be.an.instanceOf(C);
                    expect(await cSupplier3()).to.be.an.instanceOf(C);
                    expect(a1.params[1]).to.be.an.instanceOf(C);

                    expect(await cSupplier1()).to.equal(await cSupplier1());
                    expect(await cSupplier1()).to.equal(await cSupplier2());
                    if (viaASupplier) {
                        expect(await cSupplier1()).to.not.equal(await cSupplier3());
                        expect(await cSupplier1()).to.not.equal(a1.params[1]);
                    } else {
                        expect(await cSupplier1()).to.equal(await cSupplier3());
                        expect(await cSupplier1()).to.equal(a1.params[1]);
                    }

                    const supplied = await aSupplier();
                    if (viaASupplier) {
                        expect(supplied.params[1]).to.equal(a1.params[1]);
                    } else {
                        expect(supplied.params[1]).to.not.equal(a1.params[1]);
                    }
                }
            });
        });

        suite('Optimistic binding order', () => {
            test('Sync component', () => {
                const order: string[] = [];
                const addToOrder = <T extends TrackParams>(x: T): T => {
                    order.push(x.constructor.name);
                    return x;
                };

                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([B])
                            .withProvider(() => addToOrder(new A()))
                            .scoped(requestScope)
                    )
                        .addBinding(
                            bind(B)
                                .withDependencies([C])
                                .withProvider(() => addToOrder(new B()))
                                .scoped(optimisticRequestScope)
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([D])
                                .withProvider(() => addToOrder(new C()))
                                .scoped(transientScope)
                        )
                        .addBinding(
                            bind(D)
                                .withDependencies([E])
                                .withProvider(() => addToOrder(new D()))
                                .scoped(optimisticSingletonScope)
                        )
                        .addBinding(
                            bind(E)
                                .withDependencies([identifier(E).lateBinding()])
                                .withProvider(() => addToOrder(new E()))
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(F)
                                .withGenerator(() => addToOrder(new F()))
                                .scoped(optimisticSingletonScope)
                        )
                );

                container.get(A);

                expect(order).to.deep.equal([
                    // Optimistic singletons + direct dependencies
                    'E',
                    'D',
                    'F',
                    // Optimistic request + direct dependencies
                    'C',
                    'B',
                    // Requested value
                    'A',
                ]);
            });

            test('Async component', async () => {
                const order: string[] = [];
                const addToOrder = <T extends TrackParams>(x: T): T => {
                    order.push(x.constructor.name);
                    return x;
                };

                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([B])
                            .withAsyncProvider(async () => addToOrder(new A()))
                            .scoped(supplierScope)
                    )
                        .addBinding(
                            bind(B)
                                .withDependencies([C])
                                .withAsyncProvider(async () => addToOrder(new B()))
                                .scoped(optimisticRequestScope)
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([D])
                                .withAsyncProvider(async () => addToOrder(new C()))
                                .scoped(transientScope)
                        )
                        .addBinding(
                            bind(D)
                                .withDependencies([E])
                                .withAsyncProvider(async () => addToOrder(new D()))
                                .scoped(optimisticSingletonScope)
                        )
                        .addBinding(
                            bind(E)
                                .withDependencies([identifier(E).lateBinding()])
                                .withAsyncProvider(async () => addToOrder(new E()))
                                .scoped(singletonScope)
                        )
                        .addBinding(
                            bind(F)
                                .withAsyncGenerator(async () => addToOrder(new F()))
                                .scoped(optimisticSingletonScope)
                        )
                );

                await container.getAsync(A);

                expect(order).to.deep.equal([
                    // Optimistic singletons + direct dependencies
                    'F',
                    'E',
                    'D',
                    // Optimistic request + direct dependencies
                    'C',
                    'B',
                    // Requested value
                    'A',
                ]);
            });
        });
    });

    suite('Late binding', () => {
        suite('supplier', () => {
            suite('Sync container', () => {
                test('Propagate request scope', async () => {
                    interface LateSupplier {
                        lateSupplier: LateBinding<Supplier<LateSupplier | null | undefined>>;
                        asyncLateSupplier: LateBinding<
                            AsyncSupplier<LateSupplier | null | undefined>
                        >;
                    }
                    const lateBindingProvider = (
                        supplier: LateBinding<Supplier<LateSupplier | null | undefined>>,
                        asyncSupplier: LateBinding<AsyncSupplier<LateSupplier | null | undefined>>
                    ): LateSupplier => ({
                        lateSupplier: supplier,
                        asyncLateSupplier: asyncSupplier,
                    });

                    const lateSupplierIdentifier = identifier<LateSupplier>();

                    const container = createContainer(
                        createModule(
                            bind(lateSupplierIdentifier.lateBinding().supplier())
                                .withDependencies([
                                    lateSupplierIdentifier
                                        .named('A')
                                        .nullable()
                                        .undefinable()
                                        .lateBinding()
                                        .supplier({
                                            sync: true,
                                            propagateScope: true,
                                        }),
                                    lateSupplierIdentifier
                                        .named('B')
                                        .nullable()
                                        .undefinable()
                                        .lateBinding()
                                        .supplier({
                                            sync: false,
                                            propagateScope: true,
                                        }),
                                ])
                                .withProvider(lateBindingProvider)
                                .scoped(requestScope)
                        )
                            .addBinding(
                                bind(lateSupplierIdentifier.named('A').nullable().undefinable())
                                    .withDependencies([
                                        lateSupplierIdentifier.lateBinding().supplier({
                                            sync: true,
                                            propagateScope: true,
                                        }),
                                        lateSupplierIdentifier.lateBinding().supplier({
                                            sync: false,
                                            propagateScope: true,
                                        }),
                                    ])
                                    .withProvider(lateBindingProvider)
                            )
                            .addBinding(
                                bind(lateSupplierIdentifier.named('B').nullable().undefinable())
                                    .withDependencies([
                                        lateSupplierIdentifier.lateBinding().supplier({
                                            sync: true,
                                            propagateScope: true,
                                        }),
                                        lateSupplierIdentifier.lateBinding().supplier({
                                            sync: false,
                                            propagateScope: true,
                                        }),
                                    ])
                                    .withProvider(lateBindingProvider)
                            )
                    );

                    const lateSupplier = container.get(lateSupplierIdentifier);

                    const syncLateSupplier = (await lateSupplier.lateSupplier)()!;
                    const asyncLateSupplier = (await (await lateSupplier.asyncLateSupplier)())!;

                    expect(lateSupplier).to.not.equal(syncLateSupplier);
                    expect(lateSupplier).to.not.equal(asyncLateSupplier);
                    expect(lateSupplier).to.not.equal(container.get(lateSupplierIdentifier));
                    expect(syncLateSupplier).to.not.equal(asyncLateSupplier);
                    expect(syncLateSupplier).to.not.equal((await lateSupplier.lateSupplier)());
                    expect(asyncLateSupplier).to.not.equal(
                        await (await lateSupplier.asyncLateSupplier)()
                    );

                    expect((await syncLateSupplier.lateSupplier)()).to.equal(lateSupplier);
                    expect(await (await syncLateSupplier.asyncLateSupplier)()).to.equal(
                        lateSupplier
                    );

                    expect((await asyncLateSupplier.lateSupplier)()).to.equal(lateSupplier);
                    expect(await (await asyncLateSupplier.asyncLateSupplier)()).to.equal(
                        lateSupplier
                    );
                });

                test('No propagation supplier scope', async () => {
                    interface LateSupplier {
                        lateSupplier: LateBinding<Supplier<A | null | undefined>>;
                        asyncLateSupplier: LateBinding<AsyncSupplier<B | null | undefined>>;
                    }
                    const lateBindingProvider = (
                        supplier: LateBinding<Supplier<A | null | undefined>>,
                        asyncSupplier: LateBinding<AsyncSupplier<B | null | undefined>>
                    ): LateSupplier => ({
                        lateSupplier: supplier,
                        asyncLateSupplier: asyncSupplier,
                    });

                    const lateSupplierIdentifier = identifier<LateSupplier>();

                    const baseModule = createModule(
                        bind(lateSupplierIdentifier.lateBinding().supplier())
                            .withDependencies([
                                identifier(A).nullable().undefinable().lateBinding().supplier(),
                                identifier(B)
                                    .nullable()
                                    .undefinable()
                                    .lateBinding()
                                    .supplier('async'),
                            ])
                            .withProvider(lateBindingProvider)
                            .scoped(supplierScope)
                    );

                    const circularContainer = createContainer(
                        baseModule.mergeModule(
                            createModule(
                                bind(identifier(A).nullable())
                                    .withDependencies([
                                        lateSupplierIdentifier.lateBinding(),
                                        lateSupplierIdentifier.lateBinding(),
                                    ])
                                    .withConstructorProvider()
                                    .scoped(optimisticRequestScope)
                            ).addBinding(
                                bind(identifier(B).undefinable())
                                    .withDependencies([
                                        lateSupplierIdentifier.lateBinding(),
                                        lateSupplierIdentifier.lateBinding(),
                                    ])
                                    .withConstructorProvider()
                                    .scoped(optimisticRequestScope)
                            )
                        )
                    );
                    expect(() => {
                        circularContainer.wire();
                    }).to.throw(HaywireCircularDependencyError);

                    const container = createContainer(
                        baseModule.mergeModule(
                            createModule(
                                bind(identifier(A).nullable())
                                    .withDependencies([identifier(B).lateBinding().undefinable()])
                                    .withConstructorProvider()
                            ).addBinding(
                                bind(identifier(B).undefinable())
                                    .withDependencies([identifier(A).lateBinding().nullable()])
                                    .withConstructorProvider()
                            )
                        )
                    );

                    const lateSupplier = container.get(lateSupplierIdentifier);

                    const aSupplier = await lateSupplier.lateSupplier;
                    const bSupplier = await lateSupplier.asyncLateSupplier;

                    expect(aSupplier()).to.be.an.instanceOf(A);
                    expect(await bSupplier()).to.be.an.instanceOf(B);

                    expect(container.get(identifier(A).nullable())).to.not.equal(aSupplier());
                    expect(container.get(identifier(B).undefinable())).to.not.equal(
                        await bSupplier()
                    );

                    expect(aSupplier()).to.not.equal(aSupplier());
                    expect(await bSupplier()).to.not.equal(await bSupplier());

                    expect(await aSupplier()!.params[0]).to.be.an.instanceOf(B);
                    expect(await aSupplier()!.params[0]).to.not.equal(await bSupplier());
                    expect(await (await bSupplier())!.params[0]).to.be.an.instanceOf(A);
                    expect(await (await bSupplier())!.params[0]).to.not.equal(aSupplier());
                });
            });

            suite('Async container', () => {
                test('Propagate request scope', async () => {
                    interface LateSupplier {
                        lateSupplier?:
                            | LateBinding<Supplier<LateSupplier | null | undefined>>
                            | undefined;
                        asyncLateSupplier: LateBinding<
                            AsyncSupplier<LateSupplier | null | undefined>
                        >;
                    }
                    const lateBindingProvider = async (
                        asyncSupplier: LateBinding<AsyncSupplier<LateSupplier | null | undefined>>,
                        supplier?: LateBinding<Supplier<LateSupplier | null | undefined>>
                    ): Promise<LateSupplier> => ({
                        lateSupplier: supplier,
                        asyncLateSupplier: asyncSupplier,
                    });

                    const lateSupplierIdentifier = identifier<LateSupplier>();

                    const container = createContainer(
                        createModule(
                            bind(lateSupplierIdentifier.lateBinding().supplier())
                                .withDependencies([
                                    lateSupplierIdentifier
                                        .named('A')
                                        .nullable()
                                        .undefinable()
                                        .lateBinding()
                                        .supplier({
                                            sync: false,
                                            propagateScope: true,
                                        }),
                                ])
                                .withAsyncProvider(lateBindingProvider)
                                .scoped(optimisticRequestScope)
                        ).addBinding(
                            bind(lateSupplierIdentifier.named('A').nullable().undefinable())
                                .withDependencies([
                                    lateSupplierIdentifier.lateBinding().supplier({
                                        sync: false,
                                        propagateScope: true,
                                    }),
                                    lateSupplierIdentifier.lateBinding().supplier({
                                        sync: true,
                                        propagateScope: true,
                                    }),
                                ])
                                .withAsyncProvider(lateBindingProvider)
                        )
                    );

                    const lateSupplier = await container.getAsync(lateSupplierIdentifier);

                    const asyncLateSupplier = (await (await lateSupplier.asyncLateSupplier)())!;

                    expect(lateSupplier).to.not.equal(asyncLateSupplier);
                    expect(lateSupplier).to.not.equal(
                        await container.getAsync(lateSupplierIdentifier)
                    );
                    expect(asyncLateSupplier).to.not.equal(
                        await (await lateSupplier.asyncLateSupplier)()
                    );

                    expect((await asyncLateSupplier.lateSupplier!)()).to.equal(lateSupplier);
                    expect(await (await asyncLateSupplier.asyncLateSupplier)()).to.equal(
                        lateSupplier
                    );
                });

                test('No propagation supplier scope', async () => {
                    interface LateSupplier {
                        lateSupplier: LateBinding<Supplier<A | null | undefined>>;
                        asyncLateSupplier: LateBinding<AsyncSupplier<B | null | undefined>>;
                    }
                    const lateBindingProvider = async (
                        supplier: LateBinding<Supplier<A | null | undefined>>,
                        asyncSupplier: LateBinding<AsyncSupplier<B | null | undefined>>
                    ): Promise<LateSupplier> => ({
                        lateSupplier: supplier,
                        asyncLateSupplier: asyncSupplier,
                    });

                    const lateSupplierIdentifier = identifier<LateSupplier>();

                    const baseModule = createModule(
                        bind(lateSupplierIdentifier.lateBinding().supplier())
                            .withDependencies([
                                identifier(A).nullable().undefinable().lateBinding().supplier(),
                                identifier(B)
                                    .nullable()
                                    .undefinable()
                                    .lateBinding()
                                    .supplier('async'),
                            ])
                            .withAsyncProvider(lateBindingProvider)
                            .scoped(supplierScope)
                    );

                    const circularContainer = createContainer(
                        baseModule.mergeModule(
                            createModule(
                                bind(identifier(A).nullable())
                                    .withDependencies([
                                        lateSupplierIdentifier.lateBinding(),
                                        lateSupplierIdentifier.lateBinding(),
                                    ])
                                    .withConstructorProvider()
                                    .scoped(optimisticRequestScope)
                            ).addBinding(
                                bind(identifier(B).undefinable())
                                    .withDependencies([
                                        lateSupplierIdentifier.lateBinding(),
                                        lateSupplierIdentifier.lateBinding(),
                                    ])
                                    .withAsyncProvider(async (...params) => new B(...params))
                                    .scoped(optimisticRequestScope)
                            )
                        )
                    );
                    expect(() => {
                        circularContainer.wire();
                    }).to.throw(HaywireCircularDependencyError);

                    const container = createContainer(
                        baseModule.mergeModule(
                            createModule(
                                bind(identifier(A).nullable())
                                    .withDependencies([identifier(B).lateBinding().undefinable()])
                                    .withConstructorProvider()
                            ).addBinding(
                                bind(identifier(B).undefinable())
                                    .withDependencies([identifier(A).lateBinding().nullable()])
                                    .withConstructorProvider()
                            )
                        )
                    );

                    const lateSupplier = await container.getAsync(lateSupplierIdentifier);

                    const aSupplier = await lateSupplier.lateSupplier;
                    const bSupplier = await lateSupplier.asyncLateSupplier;

                    expect(aSupplier()).to.be.an.instanceOf(A);
                    expect(await bSupplier()).to.be.an.instanceOf(B);

                    expect(await container.getAsync(identifier(A).nullable())).to.not.equal(
                        aSupplier()
                    );
                    expect(await container.getAsync(identifier(B).undefinable())).to.not.equal(
                        await bSupplier()
                    );

                    expect(aSupplier()).to.not.equal(aSupplier());
                    expect(await bSupplier()).to.not.equal(bSupplier());

                    expect(await aSupplier()!.params[0]).to.be.an.instanceOf(B);
                    expect(await aSupplier()!.params[0]).to.not.equal(await bSupplier());
                    expect(await (await bSupplier())!.params[0]).to.be.an.instanceOf(A);
                    expect(await (await bSupplier())!.params[0]).to.not.equal(aSupplier());
                });
            });
        });

        test('Resolves circular dependencies', async () => {
            const container = createContainer(
                createModule(bind(A).withDependencies([B]).withConstructorProvider())
                    .addBinding(bind(B).withDependencies([C, D]).withConstructorProvider())
                    .addBinding(
                        bind(C)
                            .withDependencies([identifier(A).lateBinding().nullable()])
                            .withConstructorProvider()
                    )
                    .addBinding(
                        bind(D)
                            .withDependencies([
                                identifier(E).lateBinding().undefinable(),
                                identifier(F).lateBinding().undefinable(),
                            ])
                            .withConstructorProvider()
                    )
                    .addBinding(
                        bind(E)
                            .withDependencies([
                                identifier(E).lateBinding(),
                                identifier(F).lateBinding().undefinable(),
                                A,
                            ])
                            .withConstructorProvider()
                    )
                    .addBinding(bind(F).withDependencies([A, D, E]).withConstructorProvider())
            );

            await container.getAsync(A);
        });

        suite('Dependency failures propagate to top request', () => {
            test('Sync container', async () => {
                const supplierIdentifier = identifier<{
                    aSupplier: Supplier<A>;
                    dSupplier: AsyncSupplier<D>;
                }>();

                class CustomError extends Error {
                    public constructor() {
                        super('<ERROR>');
                        this.name = 'CustomError';
                    }
                }

                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([identifier(B).lateBinding()])
                            .withConstructorProvider()
                            .scoped(requestScope)
                    )
                        .addBinding(
                            bind(B)
                                .withDependencies([identifier(C).lateBinding()])
                                .withConstructorProvider()
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([identifier(D).lateBinding()])
                                .withConstructorProvider()
                        )
                        .addBinding(
                            bind(D)
                                .withDependencies([identifier(A).lateBinding(), E])
                                .withConstructorProvider()
                                .scoped(requestScope)
                        )
                        .addBinding(
                            bind(E).withGenerator(() => {
                                throw new CustomError();
                            })
                        )
                        .addBinding(
                            bind(supplierIdentifier)
                                .withDependencies([
                                    identifier(A).supplier({
                                        sync: true,
                                        propagateScope: true,
                                    }),
                                    identifier(D).supplier({
                                        sync: false,
                                        propagateScope: true,
                                    }),
                                ])
                                .withProvider((aSupplier, dSupplier) => ({
                                    aSupplier,
                                    dSupplier,
                                }))
                                .scoped(singletonScope)
                        )
                );

                const rejectionExpectations: PromiseLike<unknown>[] = [];
                // Perform twice, to guarantee no successful caching
                for (let i = 0; i < 2; ++i) {
                    expect(() => container.get(A)).to.throw(CustomError);
                    expect(() => container.get(D)).to.throw(CustomError);

                    const { aSupplier, dSupplier } = container.get(supplierIdentifier);
                    for (let j = 0; j < 2; ++j) {
                        expect(() => aSupplier()).to.throw(CustomError);
                        rejectionExpectations.push(
                            expect(dSupplier()).to.eventually.be.rejectedWith(CustomError)
                        );
                    }
                }
                await Promise.all(rejectionExpectations);
            });

            test('Async container', async () => {
                const supplierIdentifier = identifier<{
                    aSupplier: AsyncSupplier<A>;
                    dSupplier: AsyncSupplier<D>;
                }>();

                class CustomError extends Error {
                    public constructor() {
                        super('<ERROR>');
                        this.name = 'CustomError';
                    }
                }

                const container = createContainer(
                    createModule(
                        bind(A)
                            .withDependencies([identifier(B).lateBinding()])
                            .withAsyncProvider(() => new A())
                            .scoped(requestScope)
                    )
                        .addBinding(
                            bind(B)
                                .withDependencies([identifier(C).lateBinding()])
                                .withAsyncProvider(() => new B())
                        )
                        .addBinding(
                            bind(C)
                                .withDependencies([identifier(D).lateBinding()])
                                .withAsyncProvider(() => new C())
                        )
                        .addBinding(
                            bind(D)
                                .withDependencies([identifier(A).lateBinding(), E])
                                .withAsyncProvider(() => new D())
                                .scoped(requestScope)
                        )
                        .addBinding(
                            bind(E).withGenerator(() => {
                                throw new CustomError();
                            })
                        )
                        .addBinding(
                            bind(supplierIdentifier)
                                .withDependencies([
                                    identifier(A).supplier({
                                        sync: false,
                                        propagateScope: true,
                                    }),
                                    identifier(D).supplier({
                                        sync: false,
                                        propagateScope: true,
                                    }),
                                ])
                                .withAsyncProvider((aSupplier, dSupplier) => ({
                                    aSupplier,
                                    dSupplier,
                                }))
                                .scoped(singletonScope)
                        )
                );

                const rejectionExpectations: PromiseLike<unknown>[] = [];
                // Perform twice, to guarantee no successful caching
                for (let i = 0; i < 2; ++i) {
                    const { aSupplier, dSupplier } = await container.getAsync(supplierIdentifier);

                    await expect(container.getAsync(A)).to.eventually.be.rejectedWith(CustomError);
                    rejectionExpectations.push(
                        expect(container.getAsync(D)).to.eventually.be.rejectedWith(CustomError)
                    );

                    for (let j = 0; j < 2; ++j) {
                        rejectionExpectations.push(
                            expect(aSupplier()).to.eventually.be.rejectedWith(CustomError),
                            expect(dSupplier()).to.eventually.be.rejectedWith(CustomError)
                        );
                    }
                    await Promise.all(rejectionExpectations);
                }
            });
        });
    });

    suite('Deterministic behavior', () => {
        test('Self referential dependency', async () => {
            const container = createContainer(
                createModule(
                    bind(LinkedList)
                        .withDependencies([identifier(LinkedList).lateBinding()])
                        .withAsyncProvider(async late => {
                            const linkedList = new LinkedList(null);
                            void late.then(val => {
                                linkedList.next = val;
                            });
                            return linkedList;
                        })
                )
            );

            const node = await container.getAsync(LinkedList);

            expect(node).to.equal(node.next);
            expect(await container.getAsync(LinkedList)).to.not.equal(node);
        });

        test('Return promise from sync provider', async () => {
            interface SpecialPromise extends Promise<123> {
                specialValue: true;
                a: LateBinding<A>;
                b: LateBinding<B>;
            }

            const promiseIdentifier = identifier<SpecialPromise>().named('promise');
            const promiseSupplierIdentifier = identifier<{
                prom: SpecialPromise;
                promSupplier: Supplier<SpecialPromise>;
                promAsyncSupplier: AsyncSupplier<SpecialPromise>;
                lateProm: LateBinding<SpecialPromise>;
            }>();

            const container = createContainer(
                createModule(
                    bind(promiseIdentifier)
                        .withDependencies([
                            identifier(A).lateBinding(),
                            identifier(B).lateBinding(),
                        ])
                        .withProvider(
                            // eslint-disable-next-line @typescript-eslint/promise-function-async
                            (lateA, lateB) => {
                                const prom = Promise.resolve(123 as const);
                                return Object.assign(prom, {
                                    specialValue: true as const,
                                    a: lateA,
                                    b: lateB,
                                });
                            }
                        )
                )
                    .mergeModule(
                        createModule(
                            bind(A)
                                .withDependencies([promiseIdentifier])
                                .withAsyncProvider(pId => new A(pId))
                                .scoped(optimisticSingletonScope)
                        ).addBinding(
                            bind(B).withDependencies([promiseIdentifier]).withConstructorProvider()
                        )
                    )
                    .addBinding(
                        bind(promiseSupplierIdentifier)
                            .withDependencies([
                                promiseIdentifier,
                                promiseIdentifier.supplier(),
                                promiseIdentifier.supplier('async'),
                                promiseIdentifier.lateBinding(),
                            ])
                            .withAsyncProvider(
                                (prom, promSupplier, promAsyncSupplier, lateProm) => ({
                                    prom,
                                    promSupplier,
                                    promAsyncSupplier,
                                    lateProm,
                                })
                            )
                    )
            );

            const promiseSupplier = await container.getAsync(promiseSupplierIdentifier);
            expect(promiseSupplier.prom).to.be.an.instanceOf(Promise);
            expect(promiseSupplier.prom.specialValue).to.equal(true);

            expect(promiseSupplier.promSupplier()).to.contain({
                specialValue: true,
            });
            expect(await promiseSupplier.promAsyncSupplier()).to.equal(123);
            expect(await promiseSupplier.lateProm).to.equal(123);

            const a = await promiseSupplier.prom.a;
            expect(a.params[0]).to.contain({
                specialValue: true,
            });

            const b = await promiseSupplier.prom.b;
            expect(b.params[0]).to.equal(promiseSupplier.prom);
        });
    });

    suite('addBoundInstances', () => {
        const module = createModule(
            bind(A)
                .withDependencies([B, C])
                .withProvider(() => new A())
        )
            .addBinding(
                bind(B)
                    .withDependencies([C, identifier(D).nullable()])
                    .withProvider(() => new B())
                    .scoped(optimisticRequestScope)
            )
            .addBinding(
                bind(C)
                    .withDependencies([
                        identifier(D).undefinable(),
                        identifier(E).lateBinding(),
                        identifier(F).undefinable().nullable(),
                    ])
                    .withProvider(() => new C())
                    .scoped(optimisticSingletonScope)
            )
            .addBinding(new TempBinding(identifier(D)))
            .addBinding(new TempBinding(identifier(E)))
            .addBinding(new TempBinding(identifier(F).undefinable().nullable()));

        const extraId = identifier<123>().named('A').nullable();

        for (const sync of [false, true]) {
            suite(sync ? 'sync' : 'async', () => {
                for (const action of ['unchecked', 'checked', 'wired'] as const) {
                    suite(action, () => {
                        const container = sync
                            ? createContainer(module)
                            : createContainer(
                                  module.addBinding(
                                      bind(F)
                                          .withAsyncGenerator(() => new F())
                                          .named('async')
                                  )
                              );

                        if (action === 'checked') {
                            container.check();
                        } else if (action === 'wired') {
                            container.wire();
                        }

                        test('Add valid bindings', async () => {
                            const cloned = addBoundInstances(container, [
                                new InstanceBinding(identifier(D), new D()),
                                new InstanceBinding(identifier(E), new E()),
                                new InstanceBinding(identifier(F).nullable(), new F()),
                            ]);

                            expect(cloned).to.not.equal(container);
                            expect(await cloned.getAsync(A)).to.be.an.instanceOf(A);
                            expect(await cloned.getAsync(D)).to.be.an.instanceOf(D);
                            expect(
                                await cloned.getAsync(identifier(F).nullable().undefinable())
                            ).to.be.an.instanceOf(F);

                            const cloned2 = addBoundInstances(cloned, [
                                new InstanceBinding(extraId, 123),
                            ]);
                            expect(await cloned2.getAsync(extraId)).to.equal(123);
                        });

                        test('Add extra bindings', async () => {
                            const cloned = addBoundInstances(container, [
                                new InstanceBinding(extraId, 123),
                            ]);

                            await expect(
                                cloned.getAsync(extraId.undefinable())
                            ).to.eventually.be.rejectedWith(HaywireProviderMissingError);
                        });

                        test('Throw on duplicate binding', () => {
                            expect(() => {
                                addBoundInstances(container, [
                                    new InstanceBinding(identifier(A), new A()),
                                ]);
                            }).to.throw(HaywireModuleValidationError);
                        });
                    });
                }
            });
        }
    });

    suite('addBoundInstances with list bindings', () => {
        const numId = identifier<number>().named('nums').list();
        const sumId = identifier<number>().named('sum');

        // The list annotation is not tracked through the register/container output types (see the
        // `checkIsList` TODO), so list registration is exercised through this structural view.
        interface ListRegisterFactory {
            wire: () => void;
            register: (id: unknown, instance: unknown) => ListRegisterFactory;
            toContainer: () => { getAsync: (id: unknown) => Promise<unknown> };
        }

        for (const wired of [false, true] as const) {
            suite(wired ? 'wired' : 'unwired', () => {
                test('Replaces a temp list binding and appends further instances', async () => {
                    // A missing list dependency becomes a temp binding in the factory. Registering
                    // the first instance replaces that temp, and the second appends to it.
                    const baseId = identifier<number>().named('base');
                    const module = createModule(
                        bind(sumId)
                            // Depend on a second optimistic singleton alongside the list so the
                            // rebinding walk sees both the replaced temp and an untouched binding.
                            .withDependencies([numId, baseId])
                            .withProvider((nums, base) =>
                                nums.reduce((total, num) => total + num, base)
                            )
                            // Optimistic singletons drive upstream-dependent tracking, which the
                            // wired rebinding paths update when the temp binding is replaced.
                            .scoped(optimisticSingletonScope)
                    ).addBinding(
                        bind(baseId)
                            .withGenerator(() => 100)
                            .scoped(optimisticSingletonScope)
                    );

                    const factory = createFactory(module) as unknown as ListRegisterFactory;
                    if (wired) {
                        factory.wire();
                    }

                    const container = factory.register(numId, 1).register(numId, 2).toContainer();

                    expect(await container.getAsync(numId)).to.deep.equal([1, 2]);
                    expect(await container.getAsync(sumId)).to.equal(103);
                });

                test('Appends to an existing (non-temp) list binding', async () => {
                    const module = createModule(
                        bind(sumId)
                            .withDependencies([numId])
                            .withProvider(nums => nums.reduce((total, num) => total + num, 0))
                            .scoped(optimisticSingletonScope)
                    ).addBinding(
                        bind(numId)
                            .withGenerator(() => 10)
                            .scoped(optimisticSingletonScope)
                    );

                    const container = createContainer(module);
                    if (wired) {
                        container.wire();
                    }

                    const cloned = addBoundInstances(container, [new InstanceBinding(numId, 20)]);

                    expect(await cloned.getAsync(numId)).to.deep.equal([10, 20]);
                    expect(await cloned.getAsync(sumId)).to.equal(30);
                });

                test('Adds a brand new list binding not present in the container', async () => {
                    const freshListId = identifier<number>().named('fresh').list();
                    const module = createModule(
                        bind(sumId)
                            .withGenerator(() => 0)
                            .scoped(singletonScope)
                    );

                    const container = createContainer(module);
                    if (wired) {
                        container.wire();
                    }

                    const cloned = addBoundInstances(container, [
                        new InstanceBinding(freshListId, 7),
                        new InstanceBinding(freshListId, 8),
                    ]);

                    // The list expansion of instance bindings is not reflected in the container's
                    // output types (see the `checkIsList` TODO), so query via a structural cast.
                    const genericCloned = cloned as unknown as {
                        getAsync: (id: unknown) => Promise<number[]>;
                    };
                    expect(await genericCloned.getAsync(freshListId)).to.deep.equal([7, 8]);
                });
            });
        }
    });

    suite('List bindings', () => {
        suite('Basic list resolution', () => {
            test('Sync container with list bindings', () => {
                const numId = identifier<number>().list();

                const module = createModule(bind(numId).withGenerator(() => 1))
                    .addBinding(bind(numId).withGenerator(() => 2))
                    .addBinding(bind(numId).withGenerator(() => 3));

                const container = createContainer(module);
                expect(container).to.be.an.instanceOf(SyncContainer);

                const result = container.get(numId);
                expectTypeOf(result).toBeArray();
                expect(result).to.deep.equal([1, 2, 3]);
            });

            test('Async container with list bindings', async () => {
                const numId = identifier<number>().list();

                const module = createModule(bind(numId).withAsyncGenerator(async () => 10))
                    .addBinding(bind(numId).withGenerator(() => 20))
                    .addBinding(bind(numId).withGenerator(() => 30));

                const container = createContainer(module);
                expect(container).to.be.an.instanceOf(AsyncContainer);
                expect(container).to.not.be.an.instanceOf(SyncContainer);

                const result = await container.getAsync(numId);
                expectTypeOf(result).toBeArray();
                expect(result).to.deep.equal([10, 20, 30]);
            });

            test('List bindings alongside regular bindings', () => {
                const numListId = identifier<number>().named('nums').list();
                const strId = identifier<string>().named('str');

                const module = createModule(bind(numListId).withGenerator(() => 1))
                    .addBinding(bind(numListId).withGenerator(() => 2))
                    .addBinding(bind(strId).withInstance('hello'));

                const container = createContainer(module);
                expect(container).to.be.an.instanceOf(SyncContainer);

                expect(container.get(numListId)).to.deep.equal([1, 2]);
                expect(container.get(strId)).to.equal('hello');
            });

            test('Single list binding', () => {
                const numId = identifier<number>().list();
                const module = createModule(bind(numId).withGenerator(() => 42));
                const container = createContainer(module);

                expect(container.get(numId)).to.deep.equal([42]);
            });
        });

        suite('Scopes', () => {
            test('Mixed singleton and transient scopes', () => {
                const numListId = identifier<number>().list();
                let transientCount = 0;
                let singletonCount = 0;

                const module = createModule(
                    bind(numListId)
                        .withGenerator(() => {
                            singletonCount += 1;
                            return singletonCount;
                        })
                        .scoped(singletonScope)
                ).addBinding(
                    bind(numListId)
                        .withGenerator(() => {
                            transientCount += 1;
                            return transientCount + 100;
                        })
                        .scoped(transientScope)
                );

                const container = createContainer(module);

                const result1 = container.get(numListId);
                expect(result1).to.deep.equal([1, 101]);

                const result2 = container.get(numListId);
                // Singleton returns cached, transient gets new value
                expect(result2).to.deep.equal([1, 102]);

                const result3 = container.get(numListId);
                expect(result3).to.deep.equal([1, 103]);
            });

            test('All singleton scopes', () => {
                const numListId = identifier<number>().list();
                let count = 0;

                const module = createModule(
                    bind(numListId)
                        .withGenerator(() => {
                            count += 1;
                            return count;
                        })
                        .scoped(singletonScope)
                ).addBinding(
                    bind(numListId)
                        .withGenerator(() => {
                            count += 1;
                            return count + 100;
                        })
                        .scoped(singletonScope)
                );

                const container = createContainer(module);

                const result1 = container.get(numListId);
                const result2 = container.get(numListId);

                expect(result1).to.deep.equal(result2);
            });

            test('Request scoped list bindings', () => {
                const numListId = identifier<number>().list();
                let count = 0;

                const module = createModule(
                    bind(numListId)
                        .withGenerator(() => {
                            count += 1;
                            return count;
                        })
                        .scoped(requestScope)
                ).addBinding(
                    bind(numListId)
                        .withGenerator(() => {
                            count += 1;
                            return count + 100;
                        })
                        .scoped(requestScope)
                );

                const container = createContainer(module);

                const result1 = container.get(numListId);
                expect(result1).to.deep.equal([1, 102]);

                // New request, new values
                const result2 = container.get(numListId);
                expect(result2).to.deep.equal([3, 104]);
            });
        });

        suite('Mix of sync and async providers', () => {
            test('Async list makes container async', async () => {
                const strListId = identifier<string>().list();

                const module = createModule(bind(strListId).withGenerator(() => 'sync')).addBinding(
                    bind(strListId).withAsyncGenerator(async () => 'async')
                );

                const container = createContainer(module);
                expect(container).to.be.an.instanceOf(AsyncContainer);
                expect(container).to.not.be.an.instanceOf(SyncContainer);

                const result = await container.getAsync(strListId);
                expect(result).to.deep.equal(['sync', 'async']);
            });
        });

        suite('No provider exists', () => {
            test('Undeclared list throws sync', () => {
                const numListId = identifier<number>().list();
                const otherId = identifier<string>().named('other');

                const module = createModule(bind(otherId).withInstance('hello'));
                const container = createContainer(module);

                expect(() => {
                    // @ts-expect-error
                    container.get(numListId);
                }).to.throw(HaywireContainerValidationError, 'Providers missing for container');
            });

            test('Undeclared list throws async', async () => {
                const numListId = identifier<number>().list();
                const otherId = identifier<string>().named('other');

                const module = createModule(bind(otherId).withAsyncGenerator(async () => 'hello'));
                const container = createContainer(module);

                await expect(
                    // @ts-expect-error
                    container.getAsync(numListId)
                ).to.eventually.be.rejectedWith(
                    HaywireContainerValidationError,
                    'Providers missing for container'
                );
            });
        });

        suite('List with dependencies', () => {
            test('List bindings that have their own dependencies', () => {
                const numListId = identifier<number>().list();

                const module = createModule(bind(A).withConstructorGenerator())
                    .addBinding(bind(B).withConstructorGenerator())
                    .addBinding(
                        bind(numListId)
                            .withDependencies([A])
                            .withProvider(a => {
                                expect(a).to.be.an.instanceOf(A);
                                return 1;
                            })
                    )
                    .addBinding(
                        bind(numListId)
                            .withDependencies([B])
                            .withProvider(b => {
                                expect(b).to.be.an.instanceOf(B);
                                return 2;
                            })
                    );

                const container = createContainer(module);
                expect(container.get(numListId)).to.deep.equal([1, 2]);
            });

            test('Async list bindings with dependencies', async () => {
                const numListId = identifier<number>().list();

                const module = createModule(bind(A).withConstructorGenerator())
                    .addBinding(
                        bind(B)
                            .withAsyncGenerator(async () => new B())
                            .scoped(singletonScope)
                    )
                    .addBinding(
                        bind(numListId)
                            .withDependencies([A])
                            .withProvider(a => {
                                expect(a).to.be.an.instanceOf(A);
                                return 10;
                            })
                    )
                    .addBinding(
                        bind(numListId)
                            .withDependencies([B])
                            .withAsyncProvider(async b => {
                                expect(b).to.be.an.instanceOf(B);
                                return 20;
                            })
                    );

                const container = createContainer(module);
                const result = await container.getAsync(numListId);
                expect(result).to.deep.equal([10, 20]);
            });

            test('List binding depending on supplier of regular binding', () => {
                const numListId = identifier<number>().list();

                const module = createModule(
                    bind(A).withConstructorGenerator().scoped(singletonScope)
                ).addBinding(
                    bind(numListId)
                        .withDependencies([identifier(A).supplier()])
                        .withProvider(aSupplier => {
                            const a = aSupplier();
                            expect(a).to.be.an.instanceOf(A);
                            return 42;
                        })
                );

                const container = createContainer(module);
                expect(container.get(numListId)).to.deep.equal([42]);
            });

            test('List binding depending on late binding of regular binding', async () => {
                const numListId = identifier<number>().list();

                const module = createModule(
                    bind(A).withConstructorGenerator().scoped(singletonScope)
                ).addBinding(
                    bind(numListId)
                        .withDependencies([identifier(A).lateBinding()])
                        .withAsyncProvider(async lateA => {
                            // Late binding is a promise resolved after provider returns.
                            // Store it rather than awaiting inline.
                            void lateA.then(a => {
                                expect(a).to.be.an.instanceOf(A);
                            });
                            return 99;
                        })
                );

                const container = createContainer(module);
                const result = await container.getAsync(numListId);
                expect(result).to.deep.equal([99]);
            });
        });

        suite('Optimistic singleton preloading with list', () => {
            test('List bindings with optimistic singletons', async () => {
                const numListId = identifier<number>().list();
                const order: number[] = [];

                const module = createModule(
                    bind(numListId)
                        .withAsyncGenerator(async () => {
                            order.push(1);
                            return 1;
                        })
                        .scoped(optimisticSingletonScope)
                ).addBinding(
                    bind(numListId)
                        .withAsyncGenerator(async () => {
                            order.push(2);
                            return 2;
                        })
                        .scoped(optimisticSingletonScope)
                );

                const container = createContainer(module);

                const result1 = await container.getAsync(numListId);
                expect(result1).to.deep.equal([1, 2]);

                // Should be cached
                const result2 = await container.getAsync(numListId);
                expect(result2).to.deep.equal([1, 2]);
                // Only called twice total (once each during preload)
                expect(order).to.have.lengthOf(2);
            });
        });

        suite('Idempotent lifecycle', () => {
            test('List container lifecycle methods are idempotent', async () => {
                const numListId = identifier<number>().list();

                const module = createModule(bind(numListId).withGenerator(() => 1)).addBinding(
                    bind(numListId).withGenerator(() => 2)
                );

                const container = createContainer(module);

                container.check();
                container.check();
                container.wire();
                container.wire();
                container.preload();
                container.preload();
                await container.preloadAsync();

                expect(container.get(numListId)).to.deep.equal([1, 2]);
            });
        });

        suite('"multi" lists', () => {
            test('Multi provider contributes several elements at once', () => {
                const numId = identifier<number>().list('multi');

                const module = createModule(bind(numId).withGenerator(() => [1, 2])).addBinding(
                    bind(numId).withGenerator(() => [3, 4])
                );

                const result = createContainer(module).get(numId);
                expectTypeOf(result).toBeArray();
                expect(result).to.deep.equal([1, 2, 3, 4]);
            });

            test('Multi and single contributions combine into one list', () => {
                // A 'multi' binding returns several elements; a 'list' binding returns one.
                // Both are collected under the same base id and flattened together.
                const comboId = identifier<number>().named('combo');

                const module = createModule(
                    bind(comboId.list('multi')).withGenerator(() => [1, 2])
                ).addBinding(bind(comboId.list()).withGenerator(() => 3));

                expect(createContainer(module).get(comboId.list())).to.deep.equal([1, 2, 3]);
            });

            test('Multi provider may contribute nothing', () => {
                const numId = identifier<number>().list('multi');

                const module = createModule(bind(numId).withGenerator(() => []))
                    .addBinding(bind(numId).withGenerator(() => [7]))
                    .addBinding(bind(numId).withGenerator(() => []));

                expect(createContainer(module).get(numId)).to.deep.equal([7]);
            });

            test('Async multi makes the container async', async () => {
                const numId = identifier<number>().list('multi');

                const module = createModule(
                    bind(numId).withAsyncGenerator(async () => [1, 2])
                ).addBinding(bind(numId).withGenerator(() => [3]));

                const container = createContainer(module);
                expect(container).to.be.an.instanceOf(AsyncContainer);
                expect(container).to.not.be.an.instanceOf(SyncContainer);

                expect(await container.getAsync(numId)).to.deep.equal([1, 2, 3]);
            });

            test('Multi list is cached by singleton scope', () => {
                const numId = identifier<number>().list('multi');
                let calls = 0;

                const module = createModule(
                    bind(numId)
                        .withGenerator(() => {
                            calls += 1;
                            return [calls, calls * 10];
                        })
                        .scoped(singletonScope)
                );

                const container = createContainer(module);
                expect(container.get(numId)).to.deep.equal([1, 10]);
                expect(container.get(numId)).to.deep.equal([1, 10]);
                expect(calls).to.equal(1);
            });
        });

        suite('Consumed as a dependency', () => {
            test('Binding receives the collected array', () => {
                const numId = identifier<number>().named('n').list();
                const sumId = identifier<number>().named('sum');

                const module = createModule(bind(numId).withGenerator(() => 1))
                    .addBinding(bind(numId).withGenerator(() => 2))
                    .addBinding(bind(numId).withGenerator(() => 3))
                    .addBinding(
                        bind(sumId)
                            .withDependencies([numId])
                            .withProvider(nums => {
                                expectTypeOf(nums).toBeArray();
                                return nums.reduce((total, num) => total + num, 0);
                            })
                    );

                expect(createContainer(module).get(sumId)).to.equal(6);
            });

            test('Async binding receives the collected array', async () => {
                const numId = identifier<number>().named('n').list();
                const sumId = identifier<number>().named('sum');

                const module = createModule(bind(numId).withGenerator(() => 1))
                    .addBinding(bind(numId).withAsyncGenerator(async () => 2))
                    .addBinding(
                        bind(sumId)
                            .withDependencies([numId])
                            .withAsyncProvider(async nums =>
                                nums.reduce((total, num) => total + num, 0)
                            )
                    );

                expect(await createContainer(module).getAsync(sumId)).to.equal(3);
            });

            test('Depends on a supplier of a list', () => {
                const itemId = identifier<TrackParams>().named('item').list();
                const outId = identifier<TrackParams[]>().named('out');

                const module = createModule(
                    bind(itemId)
                        .withGenerator(() => new A())
                        .scoped(transientScope)
                )
                    .addBinding(
                        bind(itemId)
                            .withGenerator(() => new B())
                            .scoped(transientScope)
                    )
                    .addBinding(
                        bind(outId)
                            .withDependencies([itemId.supplier()])
                            .withProvider(supplier => {
                                const first = supplier();
                                const second = supplier();
                                expect(first).to.have.lengthOf(2);
                                expect(first[0]).to.be.an.instanceOf(A);
                                expect(first[1]).to.be.an.instanceOf(B);
                                // Each supplier invocation is a fresh request, so transient
                                // elements (and the array itself) are newly created.
                                expect(second).to.not.equal(first);
                                expect(second[0]).to.not.equal(first[0]);
                                return first;
                            })
                    );

                expect(createContainer(module).get(outId)).to.have.lengthOf(2);
            });

            test('Depends on a late binding of a list', async () => {
                const itemId = identifier<number>().named('item').list();
                const collectorId = identifier<{ items: number[] | undefined }>().named(
                    'collector'
                );

                const module = createModule(
                    bind(itemId)
                        .withGenerator(() => 1)
                        .scoped(singletonScope)
                )
                    .addBinding(
                        bind(itemId)
                            .withGenerator(() => 2)
                            .scoped(singletonScope)
                    )
                    .addBinding(
                        bind(collectorId)
                            .withDependencies([itemId.lateBinding()])
                            .withAsyncProvider(async lateItems => {
                                const collector: { items: number[] | undefined } = {
                                    items: undefined,
                                };
                                // Late binding resolves after the provider returns.
                                void lateItems.then(items => {
                                    collector.items = items;
                                });
                                return collector;
                            })
                    );

                const collector = await createContainer(module).getAsync(collectorId);
                await setTimeout(0);
                expect(collector.items).to.deep.equal([1, 2]);
            });

            test('Depends on a late binding of a list in a sync container', async () => {
                const itemId = identifier<number>().named('sync-item').list();
                const collectorId = identifier<{ items: number[] | undefined }>().named(
                    'sync-collector'
                );

                const module = createModule(
                    bind(itemId)
                        .withGenerator(() => 1)
                        .scoped(singletonScope)
                )
                    .addBinding(
                        bind(itemId)
                            .withGenerator(() => 2)
                            .scoped(singletonScope)
                    )
                    .addBinding(
                        bind(collectorId)
                            .withDependencies([itemId.lateBinding()])
                            .withProvider(lateItems => {
                                const collector: { items: number[] | undefined } = {
                                    items: undefined,
                                };
                                void lateItems.then(items => {
                                    collector.items = items;
                                });
                                return collector;
                            })
                    );

                const container = createContainer(module);
                expect(container).to.be.an.instanceOf(SyncContainer);

                const collector = container.get(collectorId);
                await setTimeout(0);
                expect(collector.items).to.deep.equal([1, 2]);
            });

            test('Sync propagating supplier reaches a list dependency', () => {
                const listId = identifier<number>().named('ss-list').list();
                const midId = identifier<number>().named('ss-mid');
                const outId = identifier<number>().named('ss-out');

                const module = createModule(
                    bind(listId)
                        .withGenerator(() => 1)
                        .scoped(optimisticSingletonScope)
                )
                    .addBinding(
                        bind(listId)
                            .withGenerator(() => 2)
                            .scoped(optimisticSingletonScope)
                    )
                    .addBinding(
                        bind(midId)
                            .withDependencies([listId])
                            .withProvider(nums => nums.reduce((total, num) => total + num, 0))
                    )
                    .addBinding(
                        bind(outId)
                            .withDependencies([
                                midId.supplier({ sync: true, propagateScope: true }),
                            ])
                            .withProvider(supplier => supplier())
                    );

                const container = createContainer(module);
                // Exercises the sync-supplier safety walk over a list dependency.
                container.check();
                expect(container.get(outId)).to.equal(3);
            });
        });

        suite('Element validation', () => {
            test('Class instances are validated per element', async () => {
                const aListId = identifier(A).list();

                const container = createContainer(
                    createModule(bind(aListId).withGenerator(() => new A()))
                        .addBinding(bind(aListId).withConstructorProvider().withDependencies([]))
                        .addBinding(bind(aListId).withAsyncGenerator(async () => new A()))
                );

                const result = await container.getAsync(aListId);
                expectTypeOf(result).toEqualTypeOf<MultiList<A>>();
                expect(result).to.have.lengthOf(3);
                for (const element of result) {
                    expect(element).to.be.an.instanceOf(A);
                }
            });

            test('Wrong instance element is rejected', async () => {
                const aListId = identifier(A).list();
                const invalidBinding = bind(aListId).withGenerator(() => new B() as unknown as A);

                expect(() => createContainer(createModule(invalidBinding)).get(aListId))
                    .to.throw(HaywireInstanceOfResponseError)
                    .contains({
                        message: 'Value B returned by provider is not instance of class: A(list)',
                    });

                await expect(
                    createContainer(
                        createModule(invalidBinding).addBinding(
                            bind(aListId).withAsyncGenerator(async () => new A())
                        )
                    ).getAsync(aListId)
                ).to.eventually.be.rejectedWith(HaywireInstanceOfResponseError);
            });

            test('Null element for non-nullable list is rejected', async () => {
                const numId = identifier<number>().named('nulls').list();
                const invalidBinding = bind(numId).withGenerator(() => null as unknown as number);

                expect(() => createContainer(createModule(invalidBinding)).get(numId))
                    .to.throw(HaywireNullResponseError)
                    .contains({
                        message:
                            'Null value returned for non-nullable provider: haywire-id(named: nulls, list)',
                    });

                await expect(
                    createContainer(
                        createModule(
                            bind(numId).withAsyncGenerator(async () => null as unknown as number)
                        )
                    ).getAsync(numId)
                ).to.eventually.be.rejectedWith(HaywireNullResponseError);
            });

            test('Undefined element for non-undefinable list is rejected', () => {
                const numId = identifier<number>().named('undefineds').list();

                expect(() =>
                    createContainer(
                        createModule(
                            bind(numId).withGenerator(() => undefined as unknown as number)
                        )
                    ).get(numId)
                ).to.throw(HaywireUndefinedResponseError);
            });

            test('Nullable and undefinable lists accept missing elements', () => {
                const numId = identifier<number>().named('missing').list();

                const container = createContainer(
                    createModule(bind(numId.nullable()).withGenerator(() => null))
                        .addBinding(bind(numId.undefinable()).withGenerator(() => {}))
                        .addBinding(bind(numId).withGenerator(() => 1))
                );

                const result = container.get(numId.nullable().undefinable());
                expectTypeOf(result).toEqualTypeOf<MultiList<number | null | undefined>>();
                expect(result).to.have.members([null, undefined, 1]);
            });

            suite('"multi"', () => {
                test('Returning null is a single null element', async () => {
                    const numId = identifier<number>().named('multi-null').nullable();

                    const container = createContainer(
                        createModule(bind(numId.list('multi')).withGenerator(() => null))
                            .addBinding(
                                bind(numId.list('multi')).withAsyncGenerator(async () => null)
                            )
                            .addBinding(bind(numId.list('multi')).withGenerator(() => []))
                    );

                    expect(await container.getAsync(numId.list())).to.deep.equal([null, null]);
                });

                test('Returning undefined is a single undefined element', () => {
                    const numId = identifier<number>().named('multi-undefined').undefinable();

                    const container = createContainer(
                        createModule(bind(numId.list('multi')).withGenerator(() => {}))
                    );

                    expect(container.get(numId.list())).to.deep.equal([undefined]);
                });

                test('Returning null for non-nullable is rejected', () => {
                    const numId = identifier<number>().named('multi-non-null').list('multi');

                    expect(() =>
                        createContainer(
                            createModule(
                                bind(numId).withGenerator(() => null as unknown as number[])
                            )
                        ).get(numId)
                    ).to.throw(HaywireNullResponseError);
                });

                test('Each element is validated', () => {
                    const numId = identifier<number>().named('multi-elements').list('multi');

                    expect(() =>
                        createContainer(
                            createModule(
                                bind(numId).withGenerator(() => [1, null] as unknown as number[])
                            )
                        ).get(numId)
                    ).to.throw(HaywireNullResponseError);
                });

                test('Non-array response is rejected', async () => {
                    const numId = identifier<number>().named('multi-non-array').list('multi');

                    expect(() =>
                        createContainer(
                            createModule(bind(numId).withGenerator(() => 5 as unknown as number[]))
                        ).get(numId)
                    )
                        .to.throw(HaywireListResponseError)
                        .contains({
                            message:
                                'Non-array value returned by list provider: haywire-id(named: multi-non-array, list)',
                            value: 5,
                        });

                    await expect(
                        createContainer(
                            createModule(
                                bind(numId).withAsyncGenerator(async () => 5 as unknown as number[])
                            )
                        ).getAsync(numId)
                    ).to.eventually.be.rejectedWith(HaywireListResponseError);
                });
            });
        });

        suite('Ordering', () => {
            test('Elements from a single provider retain their order', async () => {
                const letterId = identifier<string>().named('letters');
                const outId = identifier<string[]>().named('letters-out');

                const container = createContainer(
                    createModule(
                        bind(letterId.list('multi')).withAsyncGenerator(async () => {
                            await setTimeout(10);
                            return ['c', 'a', 'b'];
                        })
                    )
                        .addBinding(bind(letterId.list()).withAsyncGenerator(async () => 'x'))
                        .addBinding(bind(letterId.list()).withGenerator(() => 'y'))
                        .addBinding(
                            bind(outId)
                                .withDependencies([letterId.list()])
                                .withProvider(letters => letters)
                        )
                );

                for (const result of [
                    await container.getAsync(letterId.list()),
                    await container.getAsync(outId),
                ]) {
                    // No ordering is guaranteed across providers
                    expect(result).to.have.members(['a', 'b', 'c', 'x', 'y']);
                    const start = result.indexOf('c');
                    expect(result.slice(start, start + 3)).to.deep.equal(['c', 'a', 'b']);
                }
            });

            test('Multiple failing elements are all reported', async () => {
                const numId = identifier<number>().named('failures').list();
                const outId = identifier<number[]>().named('failures-out');

                const container = createContainer(
                    createModule(
                        bind(numId).withAsyncGenerator(async () => {
                            throw new Error('first');
                        })
                    )
                        .addBinding(
                            bind(numId).withAsyncGenerator(async () => {
                                throw new Error('second');
                            })
                        )
                        .addBinding(
                            bind(outId)
                                .withDependencies([numId])
                                .withProvider(nums => nums)
                        )
                );

                const err = await catchThrown(async () => container.getAsync(outId));
                expect(err).to.be.an.instanceOf(HaywireMultiError);
                expect((err as HaywireMultiError).causes).to.have.lengthOf(2);
            });
        });

        suite('Late binding through list elements', () => {
            for (const sync of [true, false]) {
                suite(sync ? 'sync' : 'async', () => {
                    const buildModule = () => {
                        const itemId = identifier<string>().named('item').list();
                        const summaryId = identifier<string[]>().named('summary');
                        const lateSummaries: Promise<string[]>[] = [];

                        const module = createModule(
                            bind(itemId)
                                .withDependencies([summaryId.lateBinding()])
                                .withProvider(summary => {
                                    lateSummaries.push(summary);
                                    return 'a';
                                })
                        )
                            .addBinding(
                                sync
                                    ? bind(itemId).withGenerator(() => 'b')
                                    : bind(itemId).withAsyncGenerator(async () => 'b')
                            )
                            .addBinding(
                                bind(summaryId)
                                    .withDependencies([itemId])
                                    .withProvider(items => items)
                            );
                        return { itemId, summaryId, lateSummaries, module };
                    };

                    test('Late binding in an element receives the full list', async () => {
                        const { itemId, lateSummaries, module } = buildModule();
                        const container = createContainer(module);
                        expect(isSyncContainer(container)).to.equal(sync);

                        const result = await container.getAsync(itemId);
                        expect(result).to.have.members(['a', 'b']);
                        expect(lateSummaries).to.have.lengthOf(1);
                        expect(await lateSummaries[0]).to.have.members(['a', 'b']);
                    });

                    test('Late binding when list is requested as a dependency', async () => {
                        const { summaryId, lateSummaries, module } = buildModule();
                        const container = createContainer(module);

                        const result = await container.getAsync(summaryId);
                        expect(result).to.have.members(['a', 'b']);
                        expect(lateSummaries).to.have.lengthOf(1);
                        expect(await lateSummaries[0]).to.equal(result);
                    });

                    test('Element late binds to its own list', async () => {
                        const selfId = identifier<number>().named('self').list();
                        const outId = identifier<number[]>().named('self-out');
                        const lateLists: Promise<number[]>[] = [];

                        const container = createContainer(
                            createModule(
                                sync
                                    ? bind(selfId).withGenerator(() => 1)
                                    : bind(selfId).withAsyncGenerator(async () => 1)
                            )
                                .addBinding(
                                    bind(selfId)
                                        .withDependencies([selfId.lateBinding()])
                                        .withProvider(list => {
                                            lateLists.push(list);
                                            return 2;
                                        })
                                )
                                .addBinding(
                                    bind(outId)
                                        .withDependencies([selfId])
                                        .withProvider(list => list)
                                )
                        );

                        const listResult = await container.getAsync(selfId);
                        expect(listResult).to.have.members([1, 2]);
                        expect(await lateLists[0]).to.equal(listResult);

                        const outResult = await container.getAsync(outId);
                        expect(outResult).to.have.members([1, 2]);
                        expect(await lateLists[1]).to.equal(outResult);
                        expect(lateLists).to.have.lengthOf(2);
                    });
                });
            }
        });
    });

    suite('Regression guards', () => {
        test('Async request for a non-list output returns the value, not an array', async () => {
            const container = createContainer(
                createModule(bind(A).withAsyncGenerator(async () => new A()))
            );

            const a = await container.getAsync(A);
            expectTypeOf(a).toEqualTypeOf<A>();
            expect(a).to.be.an.instanceOf(A);
            expect(Array.isArray(a)).to.equal(false);
        });

        test('Circular check reports every unsafe dependency path', () => {
            // A has two independent unsafe cycles (via B and via C). Both must be reported,
            // not just the first one encountered.
            const module = createModule(
                bind(A)
                    .withDependencies([identifier(B).lateBinding(), identifier(C).lateBinding()])
                    .withProvider((...params) => new A(...params))
            )
                .addBinding(
                    bind(B)
                        .withDependencies([identifier(A).supplier()])
                        .withProvider((...params) => new B(...params))
                )
                .addBinding(
                    bind(C)
                        .withDependencies([identifier(A).supplier()])
                        .withProvider((...params) => new C(...params))
                );

            let thrown: unknown;
            try {
                createContainer(module).wire();
            } catch (err) {
                thrown = err;
            }
            expect(thrown).to.be.an.instanceOf(HaywireCircularDependencyError);
            expect((thrown as HaywireCircularDependencyError).circularChains).to.have.lengthOf(2);
        });

        test('Self-referential late binding resolves in a sync container', async () => {
            const container = createContainer(
                createModule(
                    bind(LinkedList)
                        .withDependencies([identifier(LinkedList).lateBinding()])
                        .withProvider(late => {
                            const node = new LinkedList(null);
                            void late.then(value => {
                                node.next = value;
                            });
                            return node;
                        })
                )
            );
            expect(container).to.be.an.instanceOf(SyncContainer);

            const node = container.get(LinkedList);
            // Late bindings resolve on the next microtask, even synchronously.
            await setTimeout(0);
            expect(node.next).to.equal(node);
        });

        test('Circular late binding reuses the cached dependency in a sync container', async () => {
            // A depends on a late binding of B; B depends on A directly. When the late binding
            // resolves B, its own dependency on A must be served from the request's late binding
            // cache (the already-created A) rather than instantiated afresh.
            let capturedA: A | undefined;
            const container = createContainer(
                createModule(
                    bind(A)
                        .withDependencies([identifier(B).lateBinding()])
                        .withProvider(lateB => {
                            const a = new A();
                            void lateB.then(() => {});
                            return a;
                        })
                ).addBinding(
                    bind(B)
                        .withDependencies([A])
                        .withProvider(a => {
                            capturedA = a;
                            return new B();
                        })
                )
            );
            expect(container).to.be.an.instanceOf(SyncContainer);

            const a = container.get(A);
            await setTimeout(0);
            expect(capturedA).to.equal(a);
        });

        test('Circular late binding reuses the cached dependency in an async container', async () => {
            // Same reuse as the sync case, but an async provider routes it through the async
            // implementation path, which keeps its own late binding cache.
            let capturedA: A | undefined;
            const container = createContainer(
                createModule(
                    bind(A)
                        .withDependencies([identifier(B).lateBinding()])
                        .withAsyncProvider(async lateB => {
                            const a = new A();
                            void lateB.then(() => {});
                            return a;
                        })
                ).addBinding(
                    bind(B)
                        .withDependencies([A])
                        .withProvider(a => {
                            capturedA = a;
                            return new B();
                        })
                )
            );
            expect(container).to.be.an.instanceOf(AsyncContainer);
            expect(container).to.not.be.an.instanceOf(SyncContainer);

            const a = await container.getAsync(A);
            await setTimeout(0);
            expect(capturedA).to.equal(a);
        });

        test('Supplier opens a fresh supplier scope on each invocation', () => {
            const supplierId = identifier<{ supply: Supplier<A> }>().named('reg-supplier');

            const container = createContainer(
                createModule(
                    bind(supplierId)
                        .withDependencies([identifier(A).supplier()])
                        .withProvider(supply => ({ supply }))
                )
                    .addBinding(
                        bind(A)
                            .withDependencies([C])
                            .withProvider(c => new A(c))
                    )
                    .addBinding(bind(C).withConstructorGenerator().scoped(supplierScope))
            );

            const { supply } = container.get(supplierId);
            const a1 = supply();
            const a2 = supply();
            // A non-propagating supplier starts a new request each call, so the supplier-scoped
            // C is freshly created rather than leaking from a previously captured scope cache.
            expect(a1).to.not.equal(a2);
            expect(a1.params[0]).to.not.equal(a2.params[0]);
        });
    });
});
