import type { MultiList } from 'haywire';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import { bind, createContainer, createContainerFactory, createModule, identifier } from 'haywire';
import { HaywireDuplicateOutputError, HaywireProviderMissingError } from '#errors';

suite('factory', () => {
    class A {
        public readonly a = 'a';
    }
    const aId = identifier<A>();
    class B {
        public readonly b = 'b';
    }
    const bId = identifier(B);
    class C {
        public readonly c = 'c';
    }
    const cId = identifier<C>('c');
    class D {
        public readonly d = 'd';
    }
    const dId = identifier(D).named('d');
    class E {
        public readonly e = 'e';
    }
    const eId = identifier(E);
    class F {
        public readonly f = 'f';
    }
    const fId = identifier(F);

    const module = createModule(
        bind(aId)
            .withDependencies([bId, cId])
            .withProvider(() => new A())
    )
        .addBinding(
            bind(bId)
                .withDependencies([cId, dId.nullable()])
                .withProvider(() => new B())
        )
        .addBinding(
            bind(cId)
                .withDependencies([
                    dId.undefinable(),
                    eId.deferred(),
                    fId.nullable().undefinable().supplier(),
                ])
                .withProvider(() => new C())
        );

    test('Cannot create container', () => {
        // @ts-expect-error
        createContainer(module);

        const factory = createContainerFactory(module);

        expect(() => {
            // @ts-expect-error
            factory.toContainer();
        }).to.throw(HaywireProviderMissingError);
    });

    suite('sync', () => {
        const factory = createContainerFactory(module);
        factory.check();
        factory.wire();

        suite('register', () => {
            const fulfilledFactory = factory
                .bindInstance(dId, new D())
                .bindInstance(E, new E())
                .bindInstance(fId.nullable(), null);

            const extraId = identifier<number>();
            const withExtras = fulfilledFactory
                .bindInstance(A, new A())
                .bindInstance(D, new D())
                .bindInstance(eId.named('e'), new E())
                .bindInstance(extraId.nullable().deferred(), 123);

            test('toContainer', () => {
                const container = fulfilledFactory.toContainer();
                expectTypeOf(container).toEqualTypeOf(createContainer(fulfilledFactory));

                expect(container.get(aId)).to.be.an.instanceOf(A);
                expect(container.get(E)).to.equal(container.get(eId));
                expect(container.get(fId.nullable())).to.equal(null);

                const extrasContainer = withExtras.toContainer();
                expect(extrasContainer.get(E)).to.equal(container.get(eId));
                expect(extrasContainer.get(eId.named('e').nullable())).to.be.an.instanceOf(E);
                expect(extrasContainer.get(extraId.nullable())).to.equal(123);

                expect(() => {
                    // @ts-expect-error
                    container.get(fId);
                }).to.throw(HaywireProviderMissingError);
                expect(() => {
                    // @ts-expect-error
                    extrasContainer.get(extraId);
                }).to.throw(HaywireProviderMissingError);
            });

            test('Do not duplicate outputs', () => {
                // Part of original outputs
                expect(() => {
                    // @ts-expect-error
                    factory.bindInstance(aId, new A());
                }).to.throw(HaywireDuplicateOutputError);

                // Duplicate register
                expect(() => {
                    // @ts-expect-error
                    factory.bindInstance(dId, new D()).bindInstance(dId, new D());
                }).to.throw(HaywireDuplicateOutputError);
            });

            test('Bound instances does not match type', () => {
                // Not matching type
                // @ts-expect-error
                factory.bindInstance(dId, new E());
                // @ts-expect-error
                factory.bindInstance(F, null);
            });

            test('Output does not fully satisfy dependencies', () => {
                // Does not fully satisfy dependencies
                expect(() => {
                    // @ts-expect-error
                    factory.bindInstance(eId.nullable(), new E());
                }).to.throw(HaywireProviderMissingError);
            });
        });
    });

    suite('async', () => {
        const factory = createContainerFactory(
            module.addBinding(
                bind(identifier<number>().nullable().named('async')).withAsyncFactory(() => null)
            )
        );

        suite('register', () => {
            const fulfilledFactory = factory
                .bindInstance(dId, new D())
                .bindInstance(E, new E())
                .bindInstance(fId.nullable(), null);

            const extraId = identifier<number>();
            const withExtras = fulfilledFactory
                .bindInstance(A, new A())
                .bindInstance(D, new D())
                .bindInstance(eId.named('e'), new E())
                .bindInstance(extraId.nullable().deferred(), 123);

            test('toContainer', async () => {
                const container = fulfilledFactory.toContainer();
                expectTypeOf(container).toEqualTypeOf(createContainer(fulfilledFactory));

                expect(await container.getAsync(aId)).to.be.an.instanceOf(A);
                expect(await container.getAsync(E)).to.equal(await container.getAsync(eId));
                expect(await container.getAsync(fId.nullable())).to.equal(null);

                const extrasContainer = withExtras.toContainer();
                expect(await extrasContainer.getAsync(E)).to.equal(await container.getAsync(eId));
                expect(
                    await extrasContainer.getAsync(eId.named('e').nullable())
                ).to.be.an.instanceOf(E);
                expect(await extrasContainer.getAsync(extraId.nullable())).to.equal(123);

                await expect(
                    // @ts-expect-error
                    container.getAsync(fId)
                ).to.be.rejectedWith(HaywireProviderMissingError);
                await expect(
                    // @ts-expect-error
                    extrasContainer.getAsync(extraId)
                ).to.be.rejectedWith(HaywireProviderMissingError);
            });
        });
    });

    suite('list', () => {
        const numListId = identifier<number>().named('nums').list();
        const sumId = identifier<number>().named('sum');
        const sumBinding = bind(sumId)
            .withDependencies([numListId])
            .withProvider(nums => nums.reduce((total, num) => total + num, 0));

        test('Module list outputs satisfy dependencies', () => {
            const factory = createContainerFactory(
                createModule(bind(numListId).withFactory(() => 1)).addBinding(sumBinding)
            );

            const container = factory.toContainer();
            expect(container.get(sumId)).to.equal(1);
            expect(container.get(numListId)).to.deep.equal([1]);
        });

        test('Registered elements are added to module elements', () => {
            const factory = createContainerFactory(
                createModule(bind(numListId).withFactory(() => 1)).addBinding(sumBinding)
            );
            factory.wire();

            const container = factory
                .bindInstance(numListId, 2)
                .bindInstance(numListId, 3)
                .toContainer();
            expect(container.get(sumId)).to.equal(6);
            expect(container.get(numListId)).to.have.members([1, 2, 3]);
        });

        test('Missing list is satisfied by registering elements', () => {
            const factory = createContainerFactory(createModule(sumBinding));

            expect(() => {
                // @ts-expect-error
                factory.toContainer();
            }).to.throw(HaywireProviderMissingError);

            const container = factory
                .bindInstance(numListId, 2)
                .bindInstance(numListId, 3)
                .toContainer();
            const nums = container.get(numListId);
            expectTypeOf(nums).toEqualTypeOf<MultiList<number>>();
            expect(nums).to.have.members([2, 3]);
            expect(container.get(sumId)).to.equal(5);
        });

        test('Register "multi" elements', () => {
            const factory = createContainerFactory(createModule(sumBinding));

            const container = factory
                .bindInstance(numListId.list('multi'), [1, 2])
                .bindInstance(numListId.list('multi'), [])
                .toContainer();
            expect(container.get(numListId)).to.have.members([1, 2]);
            expect(container.get(sumId)).to.equal(3);

            const nullableId = identifier<number>().named('nullable-nums').nullable();
            const nullableContainer = createContainerFactory(
                createModule(bind(sumId).withFactory(() => 0))
            )
                .bindInstance(nullableId.list('multi'), null)
                .toContainer();
            expect(nullableContainer.get(nullableId.list())).to.deep.equal([null]);
        });

        test('Registered elements must satisfy list dependencies', () => {
            const factory = createContainerFactory(createModule(sumBinding));

            expect(() => {
                // @ts-expect-error
                factory.bindInstance(numListId.nullable(), null);
            }).to.throw(HaywireProviderMissingError);

            expect(() => {
                // @ts-expect-error
                factory.bindInstance(numListId, 1).bindInstance(numListId.nullable(), null);
            }).to.throw(HaywireProviderMissingError);

            const satisfiedFactory = createContainerFactory(
                createModule(bind(numListId).withFactory(() => 1)).addBinding(sumBinding)
            );
            expect(() => {
                // @ts-expect-error
                satisfiedFactory.bindInstance(numListId.nullable(), null);
            }).to.throw(HaywireProviderMissingError);
        });

        test('Laxer elements restrict requestable ids', () => {
            const otherListId = identifier<number>().named('others').list();
            const factory = createContainerFactory(createModule(bind(sumId).withFactory(() => 0)));
            factory.wire();

            const strictContainer = factory.bindInstance(otherListId, 1).toContainer();
            expect(strictContainer.get(otherListId)).to.deep.equal([1]);

            const laxContainer = factory
                .bindInstance(otherListId, 1)
                .bindInstance(otherListId.nullable(), null)
                .toContainer();
            expect(laxContainer.get(otherListId.nullable())).to.have.members([1, null]);
            expect(() => {
                // @ts-expect-error
                laxContainer.get(otherListId);
            }).to.throw(HaywireProviderMissingError);
        });

        test('Module list too lax for dependency cannot be satisfied', () => {
            const laxModule = createModule(bind(numListId.nullable()).withFactory(() => null));
            // @ts-expect-error
            const invalidModule = laxModule.addBinding(sumBinding);
            const factory = createContainerFactory(invalidModule);

            expect(() => {
                // @ts-expect-error
                factory.toContainer();
            }).to.throw(HaywireProviderMissingError);
            expect(() => factory.bindInstance(numListId, 1)).to.throw(HaywireProviderMissingError);
        });

        test('Async', async () => {
            const factory = createContainerFactory(
                createModule(bind(numListId).withAsyncFactory(async () => 1)).addBinding(sumBinding)
            );

            const container = factory.bindInstance(numListId, 2).toContainer();
            expect(await container.getAsync(sumId)).to.equal(3);
        });
    });

    suite('Module outputs', () => {
        test('Supplier and deferred dependencies are satisfied by module outputs', () => {
            const numId = identifier<number>().named('num');
            const outId = identifier<number>().named('out');

            const container = createContainerFactory(
                createModule(bind(numId).withFactory(() => 1)).addBinding(
                    bind(outId)
                        .withDependencies([numId.supplier(), numId.deferred()])
                        .withProvider(supplier => supplier() + 1)
                )
            ).toContainer();

            expect(container.get(outId)).to.equal(2);
        });

        test('Module binding too lax for dependency is not replaced', () => {
            const numId = identifier<number>().named('lax');
            const outId = identifier<number>().named('lax-out');

            const laxModule = createModule(bind(numId.nullable()).withFactory(() => 1));
            const invalidModule = laxModule.addBinding(
                // @ts-expect-error
                bind(outId)
                    .withDependencies([numId])
                    .withProvider(num => num)
            );
            const factory = createContainerFactory(invalidModule);

            expect(() => {
                // @ts-expect-error
                factory.toContainer();
            }).to.throw(HaywireProviderMissingError);
            expect(() => {
                // @ts-expect-error
                factory.bindInstance(numId, 1);
            }).to.throw(HaywireDuplicateOutputError);
        });
    });
});
