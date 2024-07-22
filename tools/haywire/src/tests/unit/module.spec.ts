import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import {
    AsyncContainer,
    bind,
    createContainer,
    createModule,
    HaywireContainerValidationError,
    HaywireModuleValidationError,
    identifier,
    Module,
    SyncContainer,
} from 'haywire';
import { expect } from '../chai-hooks.js';

suite('module', () => {
    const aOrBId = identifier<'a' | 'b'>('<custom-name>').named('AorB').nullable().undefinable();
    const numberId = identifier<number>().named('num');
    abstract class Foo {
        // eslint-disable-next-line @typescript-eslint/class-methods-use-this
        public doFoo() {
            return true;
        }
    }
    class Bar extends Foo {
        protected constructor() {
            super();
        }
        // eslint-disable-next-line @typescript-eslint/class-methods-use-this
        public doBar() {
            return 'bar';
        }
    }
    class Baz {
        protected readonly baz: number;
        public constructor(baz: number) {
            this.baz = baz;
        }
    }

    const uniqueSym = Symbol('abc');

    const aOrBBinding = bind(aOrBId)
        .withDependencies([aOrBId.lateBinding()])
        .withProvider(() => 'a');
    const numberBinding = bind(numberId).withInstance(123);
    const fooBinding = bind(identifier(Foo).nullable().undefinable().named(uniqueSym))
        .withDependencies([identifier(Bar).nullable()])
        .withProvider(bar => bar);
    const barBinding = bind(Bar).withGenerator(() => {
        class Extends extends Bar {
            public constructor() {
                super();
            }
        }
        return new Extends();
    });
    const bazBinding = bind(Baz)
        .withDependencies([numberId.supplier(), aOrBId.supplier()])
        .withAsyncProvider(numSupplier => new Baz(numSupplier()));

    suite('fromBinding', () => {
        const aOrBModule = Module.fromBinding(aOrBBinding);
        const numberModule = Module.fromBinding(numberBinding);
        const fooModule = Module.fromBinding(fooBinding);
        const barModule = createModule(barBinding);
        const bazModule = createModule(bazBinding);

        Module.fromBinding(
            bind(numberId)
                .withDependencies([numberId])
                .withProvider(() => 1)
        );
        // @ts-expect-error
        Module.fromBinding(
            bind(numberId.nullable())
                .withDependencies([numberId])
                .withProvider(() => 1)
        );

        expect(createContainer(aOrBModule)).to.be.an.instanceOf(SyncContainer);
        expectTypeOf(createContainer(aOrBModule)).toHaveProperty('get');

        createContainer(numberModule);

        // @ts-expect-error
        createContainer(bazModule);

        suite('addBinding', () => {
            const module = aOrBModule.addBinding(numberBinding).addBinding(fooBinding);
            expectTypeOf(module).toEqualTypeOf(
                fooModule.addBinding(numberBinding).addBinding(aOrBBinding)
            );

            // @ts-expect-error
            createContainer(module);

            const withBarModule = module.addBinding(barBinding);
            // @ts-expect-error
            fooModule.addBinding(barBinding.undefinable());

            expect(createContainer(withBarModule)).to.be.an.instanceOf(SyncContainer);
            expectTypeOf(createContainer(withBarModule)).toHaveProperty('get');

            const withBazModule = withBarModule.addBinding(bazBinding);

            expect(createContainer(withBazModule)).to.be.an.instanceOf(AsyncContainer);
            expect(createContainer(withBazModule)).to.not.be.an.instanceOf(SyncContainer);
            expectTypeOf(createContainer(withBazModule)).not.toHaveProperty('getSync');

            const dupeNumberBinding = bind(
                identifier<number>().nullable().undefinable().supplier().lateBinding()
            ).withInstance(4);
            numberModule.addBinding(dupeNumberBinding);
            numberModule.addBinding(dupeNumberBinding.named('<name>'));

            withBazModule.addBinding(dupeNumberBinding);
            withBazModule.addBinding(dupeNumberBinding.named('<name>'));

            bazModule.addBinding(numberBinding);
            numberModule.addBinding(bazBinding);
            fooModule.addBinding(dupeNumberBinding);

            const dependencyOnUnnamedFoo = withBarModule.addBinding(
                bind(identifier<'<val>'>())
                    .withDependencies([Foo])
                    .withProvider(() => '<val>')
            );
            // @ts-expect-error
            createContainer(dependencyOnUnnamedFoo);

            test('Do not allow duplicate outputs', () => {
                // @ts-expect-error
                numberModule.addBinding(dupeNumberBinding.named('num'));

                // @ts-expect-error
                withBazModule.addBinding(dupeNumberBinding.named('num'));

                expect(() => {
                    // @ts-expect-error
                    aOrBModule.addBinding(aOrBBinding);
                })
                    .to.throw(HaywireModuleValidationError)
                    .contains({
                        message:
                            'Duplicate output identifier for module: <custom-name>(named: AorB)',
                    });

                const symNumberBinding = bind(numberId.named(uniqueSym)).withInstance(123);
                expect(() => {
                    const hasUniqueNumberModule = module.addBinding(numberBinding.named(uniqueSym));
                    // @ts-expect-error
                    hasUniqueNumberModule.addBinding(symNumberBinding);
                })
                    .to.throw(HaywireModuleValidationError)
                    .contains({
                        message:
                            'Duplicate output identifier for module: haywire-id(named: Symbol(abc))',
                    });

                expect(() => {
                    // @ts-expect-error
                    barModule.addBinding(
                        bind(identifier(Bar).nullable().undefinable()).withInstance({} as Bar)
                    );
                })
                    .to.throw(HaywireModuleValidationError)
                    .contains({
                        message: 'Duplicate output identifier for module: Bar',
                    });
            });

            test('Do not allow dependencies that are not satisfied by output', () => {
                // @ts-expect-error
                const invalidModule = bazModule.addBinding(numberBinding.nullable());

                expect(() => {
                    // @ts-expect-error
                    createContainer(invalidModule).check();
                })
                    .to.throw(HaywireContainerValidationError)
                    .contains({
                        message:
                            'Providers missing for container: <custom-name>(named: AorB, nullable, undefinable), haywire-id(named: num)',
                    });
            });

            test('Do not allow outputs that do not satisfiy outputs', () => {
                const nullableNumberModule = Module.fromBinding(numberBinding.nullable());
                // @ts-expect-error
                const invalidModule = nullableNumberModule.addBinding(bazBinding);

                expect(() => {
                    // @ts-expect-error
                    createContainer(invalidModule).check();
                })
                    .to.throw(HaywireContainerValidationError)
                    .contains({
                        message:
                            'Providers missing for container: <custom-name>(named: AorB, nullable, undefinable), haywire-id(named: num)',
                    });
            });
        });

        suite('mergeModule', () => {
            const module = numberModule.mergeModule(aOrBModule);
            expectTypeOf(module).toEqualTypeOf(aOrBModule.mergeModule(numberModule));

            createContainer(module);

            const withFooModule = module.mergeModule(fooModule.mergeModule(barModule));

            expect(createContainer(withFooModule)).to.be.an.instanceOf(SyncContainer);
            expectTypeOf(createContainer(withFooModule)).toHaveProperty('get');

            const withBazModule = withFooModule.mergeModule(bazModule);
            expect(createContainer(withBazModule)).to.be.an.instanceOf(AsyncContainer);
            expect(createContainer(withBazModule)).to.not.be.an.instanceOf(SyncContainer);
            expectTypeOf(createContainer(withBazModule)).not.toHaveProperty('getSync');

            const dupNumBinding = bind(
                identifier<number>().nullable().undefinable().supplier().lateBinding()
            ).withInstance(4);

            module
                .mergeModule(createModule(dupNumBinding))
                .mergeModule(createModule(dupNumBinding.named('<name>')));

            const dependencyOnUnnamedFoo = withFooModule.mergeModule(
                createModule(
                    bind(identifier<'<val>'>())
                        .withDependencies([Foo])
                        .withProvider(() => '<val>')
                )
            );

            // @ts-expect-error
            createContainer(dependencyOnUnnamedFoo);

            test('Do not allow duplicate outouts', () => {
                // @ts-expect-error
                module.mergeModule(createModule(dupNumBinding.named('num')));

                expect(() => {
                    // @ts-expect-error
                    module.mergeModule(module);
                })
                    .to.throw(HaywireModuleValidationError)
                    .contains({
                        message: [
                            'Duplicate output identifier for module: <custom-name>(named: AorB)',
                            'haywire-id(named: num)',
                        ].join(', '),
                    });

                expect(() => {
                    // @ts-expect-error
                    module.mergeModule(fooModule.mergeModule(numberModule));
                })
                    .to.throw(HaywireModuleValidationError)
                    .contains({
                        message: 'Duplicate output identifier for module: haywire-id(named: num)',
                    });

                const symNumberModule = createModule(
                    bind(numberId.named(uniqueSym)).withInstance(123)
                );
                expect(() => {
                    const hasUniqueNumberodule = module.addBinding(numberBinding.named(uniqueSym));
                    // @ts-expect-error
                    hasUniqueNumberodule.mergeModule(symNumberModule);
                })
                    .to.throw(HaywireModuleValidationError)
                    .contains({
                        message:
                            'Duplicate output identifier for module: haywire-id(named: Symbol(abc))',
                    });
            });

            test('Do not allow dependencies that are not satisfied by output', () => {
                const dependsOnNamedFoo = createModule(
                    bind(identifier<'<val>'>())
                        .withDependencies([identifier(Foo).named(uniqueSym)])
                        .withProvider(() => '<val>')
                );

                // @ts-expect-error
                const invalidModule = withFooModule.mergeModule(dependsOnNamedFoo);

                expect(() => {
                    // @ts-expect-error
                    createContainer(invalidModule).check();
                })
                    .to.throw(HaywireContainerValidationError)
                    .contains({
                        message: 'Providers missing for container: Foo(named: Symbol(abc))',
                    });
            });

            test('Do not allow outputs that do not satisfiy outputs', () => {
                const nullableBarModule = createModule(barBinding.undefinable());
                // @ts-expect-error
                const invalidModule = fooModule.mergeModule(nullableBarModule);

                expect(() => {
                    // @ts-expect-error
                    createContainer(invalidModule).check();
                })
                    .to.throw(HaywireContainerValidationError)
                    .contains({
                        message: 'Providers missing for container: Bar(nullable)',
                    });

                const nullableAndUndefinableBarModule = createModule(
                    barBinding.nullable().undefinable()
                );
                // @ts-expect-error
                fooModule.mergeModule(nullableAndUndefinableBarModule);
            });
        });
    });
});
