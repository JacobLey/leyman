import { setTimeout } from 'node:timers/promises';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import {
    AsyncContainer,
    type AsyncSupplier,
    bind,
    createContainer,
    createModule,
    HaystackContainerValidationError,
    type HaystackIdType,
    HaystackModuleValidationError,
    identifier,
    isSyncContainer,
    type LateBinding,
    optimisticRequestScope,
    optimisticSingletonScope,
    requestScope,
    singletonScope,
    type Supplier,
    supplierScope,
    SyncContainer,
    transientScope,
} from 'haywire';
import { InstanceBinding, TempBinding } from '#binding';
import { addBoundInstances } from '#container';
import {
    HaystackCircularDependencyError,
    HaystackInstanceOfResponseError,
    HaystackMultiError,
    HaystackNullResponseError,
    HaystackProviderMissingError,
    HaystackSyncSupplierError,
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
            .addBinding(bind(D).withConstructor().scoped(requestScope));

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
            .addBinding(bind(D).withConstructor().scoped(requestScope));

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
                ).addBinding(bind(Simple).withConstructor())
            );

            expect(() => {
                container.wire();
            }).to.throw(
                HaystackContainerValidationError,
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
                }).to.throw(HaystackContainerValidationError, 'Providers missing for container: A');

                expect(() => {
                    // @ts-expect-error
                    syncContainer.get(identifier<B>());
                }).to.throw(
                    HaystackContainerValidationError,
                    'Providers missing for container: haystack-id'
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
                    HaystackContainerValidationError,
                    'Providers missing for container: A'
                );

                await expect(
                    // @ts-expect-error
                    asyncContainer.getAsync(identifier<B>())
                ).to.eventually.be.rejectedWith(
                    HaystackContainerValidationError,
                    'Providers missing for container: haystack-id'
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
                        .addBinding(bind(B).withConstructor())
                );
                expect(() => {
                    container.wire();
                })
                    .to.throw(HaystackCircularDependencyError)
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
                        .addBinding(bind(B).withConstructor())
                );
                expect(() => {
                    container.wire();
                })
                    .to.throw(HaystackCircularDependencyError)
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
                    .to.throw(HaystackCircularDependencyError)
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
                    .to.throw(HaystackCircularDependencyError)
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
                    .to.throw(HaystackSyncSupplierError)
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
                    .to.throw(HaystackSyncSupplierError)
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
                    .to.throw(HaystackNullResponseError)
                    .that.contains({
                        message: 'Null value returned for non-nullable provider: B',
                    });

                await expect(container.getAsync(A))
                    .to.eventually.be.rejectedWith(HaystackNullResponseError)
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
                    .to.eventually.be.rejectedWith(HaystackNullResponseError)
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
                                    // eslint-disable-next-line @typescript-eslint/only-throw-error
                                    throw '<ERROR>';
                                })
                                .scoped(singletonScope)
                        )
                );

                await container.preloadAsync();

                await expect(container.getAsync(A))
                    .to.eventually.be.rejectedWith(HaystackMultiError)
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
                expect(settled.every(result => result.status === 'rejected'));
                const failures = settled as [PromiseRejectedResult, PromiseRejectedResult];
                expect(failures[0].reason)
                    .to.be.an.instanceOf(HaystackInstanceOfResponseError)
                    .that.contains({
                        message: 'Value E returned by provider is not instance of class: D',
                    });
                expect(failures[0].reason === failures[1].reason);

                await expect(bSupplier())
                    .to.eventually.be.rejectedWith(HaystackInstanceOfResponseError)
                    .that.does.not.equal(failures[0].reason);

                const failedContainer = createContainer(
                    createModule(
                        bind(D)
                            .withDependencies([E])
                            .withAsyncProvider(() => ({ d: false }) as unknown as D)
                            .scoped(optimisticSingletonScope)
                    ).addBinding(bind(E).withConstructor())
                );
                failedContainer.wire();
                await expect(failedContainer.preloadAsync())
                    .to.be.rejectedWith(HaystackInstanceOfResponseError)
                    .that.eventually.contain({
                        message:
                            'Value {"d":false} returned by provider is not instance of class: D',
                    });
                await expect(failedContainer.getAsync(E)).to.be.rejectedWith(
                    HaystackInstanceOfResponseError
                );
            });

            test('Binding does not exist', async () => {
                const container = createContainer(
                    createModule(bind(identifier<123>()).withInstance(123))
                );

                expect(() => container.get(identifier<123>('custom-name')))
                    .to.throw(HaystackProviderMissingError)
                    .that.contains({
                        message: 'Providers missing for container: custom-name',
                    });
                await expect(container.getAsync(identifier<123>())).to.eventually.be.rejectedWith(
                    HaystackProviderMissingError
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
            expect(errors[0]).to.be.an.instanceOf(HaystackMultiError);
            expect(errors[0]).to.eq(errors[1]);

            const { causes } = errors[0] as HaystackMultiError;

            // Causes are related to B + C failures
            expect(causes[0]).to.be.an.instanceOf(HaystackInstanceOfResponseError).that.contains({
                message: 'Value 123 returned by provider is not instance of class: B',
            });
            expect(causes[1]).to.be.an.instanceOf(Error).that.contains({
                message: 'Bad C',
            });

            // Invoking B + C result in same looking errors
            expect(errors[2]).to.be.an.instanceOf(HaystackInstanceOfResponseError).that.contains({
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
                        .addBinding(bind(B).withConstructor().scoped(singletonScope))
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
                    .to.be.an.instanceOf(HaystackInstanceOfResponseError)
                    .that.contains({
                        message: 'Value {} returned by provider is not instance of class: F',
                    });
                expect(throwns[1]).to.be.an.instanceOf(HaystackInstanceOfResponseError);
                expect(throwns[0]).to.not.equal(throwns[1]);
                expect(() => container.get(A))
                    .to.throw(HaystackInstanceOfResponseError)
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
                    .addBinding(bind(C).withConstructor().scoped(requestScope))
                    .addBinding(bind(D).withConstructor().scoped(optimisticRequestScope))
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
                    .addBinding(bind(F).withConstructor().scoped(supplierScope))
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
                        .addBinding(bind(B).withConstructor().scoped(requestScope))
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
                        .addBinding(bind(C).withConstructor().scoped(requestScope))
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

                    const { cSupplier: cSupplier1 } = a.params[2] as HaystackIdType<
                        typeof cSupplierIdentifier
                    >;
                    const { cSupplier: cSupplier2 } = a.params[3] as HaystackIdType<
                        typeof cSupplierIdentifier
                    >;
                    const { cSupplier: cSupplier3 } = a.params[4] as HaystackIdType<
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

                    const { cSupplier: cSupplier1 } = a1.params[2] as HaystackIdType<
                        typeof cSupplierIdentifier
                    >;
                    const { cSupplier: cSupplier2 } = a1.params[3] as HaystackIdType<
                        typeof cSupplierIdentifier
                    >;
                    const { cSupplier: cSupplier3 } = a1.params[4] as HaystackIdType<
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
                    }).to.throw(HaystackCircularDependencyError);

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
                    }).to.throw(HaystackCircularDependencyError);

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
                            ).to.eventually.be.rejectedWith(HaystackProviderMissingError);
                        });

                        test('Throw on duplicate binding', () => {
                            expect(() => {
                                addBoundInstances(container, [
                                    new InstanceBinding(identifier(A), new A()),
                                ]);
                            }).to.throw(HaystackModuleValidationError);
                        });
                    });
                }
            });
        }
    });
});
