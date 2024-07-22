import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import { bind, createContainer, createFactory, createModule, identifier } from 'haywire';
import { HaywireDuplicateOutputError, HaywireProviderMissingError } from '#errors';
import { expect } from '../chai-hooks.js';

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
                    eId.lateBinding(),
                    fId.nullable().undefinable().supplier(),
                ])
                .withProvider(() => new C())
        );

    test('Cannot create container', () => {
        // @ts-expect-error
        createContainer(module);

        const factory = createFactory(module);

        expect(() => {
            // @ts-expect-error
            factory.toContainer();
        }).to.throw(HaywireProviderMissingError);
    });

    suite('sync', () => {
        const factory = createFactory(module);
        factory.check();
        factory.wire();

        suite('register', () => {
            const fulfilledFactory = factory
                .register(dId, new D())
                .register(E, new E())
                .register(fId.nullable(), null);

            const extraId = identifier<number>();
            const withExtras = fulfilledFactory
                .register(A, new A())
                .register(D, new D())
                .register(eId.named('e'), new E())
                .register(extraId.nullable().lateBinding(), 123);

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
                    factory.register(aId, new A());
                }).to.throw(HaywireDuplicateOutputError);

                // Duplicate register
                expect(() => {
                    // @ts-expect-error
                    factory.register(dId, new D()).register(dId, new D());
                }).to.throw(HaywireDuplicateOutputError);
            });

            test('Bound instances does not match type', () => {
                // Not matching type
                // @ts-expect-error
                factory.register(dId, new E());
                // @ts-expect-error
                factory.register(F, null);
            });

            test('Output does not fully satisfy dependencies', () => {
                // Does not fully satisfy dependencies
                expect(() => {
                    // @ts-expect-error
                    factory.register(eId.nullable(), new E());
                }).to.throw(HaywireProviderMissingError);
            });
        });
    });

    suite('async', () => {
        const factory = createFactory(
            module.addBinding(
                bind(identifier<number>().nullable().named('async')).withAsyncGenerator(() => null)
            )
        );

        suite('register', () => {
            const fulfilledFactory = factory
                .register(dId, new D())
                .register(E, new E())
                .register(fId.nullable(), null);

            const extraId = identifier<number>();
            const withExtras = fulfilledFactory
                .register(A, new A())
                .register(D, new D())
                .register(eId.named('e'), new E())
                .register(extraId.nullable().lateBinding(), 123);

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
                ).to.eventually.be.rejectedWith(HaywireProviderMissingError);
                await expect(
                    // @ts-expect-error
                    extrasContainer.getAsync(extraId)
                ).to.eventually.be.rejectedWith(HaywireProviderMissingError);
            });
        });
    });
});
