import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import {
    AsyncContainer,
    bind,
    createContainer,
    createModule,
    HaystackModuleValidationError,
    identifier,
    Module,
    SyncContainer,
} from 'haywire';

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

        expect(createContainer(aOrBModule)).to.be.an.instanceOf(SyncContainer);
        expectTypeOf(createContainer(aOrBModule)).toHaveProperty('get');

        createContainer(numberModule);

        // @ts-expect-error
        createContainer(bazModule);

        test('addBinding', () => {
            const module = aOrBModule.addBinding(numberBinding).addBinding(fooBinding);
            expectTypeOf(module).toEqualTypeOf(
                fooModule.addBinding(numberBinding).addBinding(aOrBBinding)
            );

            // @ts-expect-error
            createContainer(module);

            const withBarModule = module.addBinding(barBinding);

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
            // @ts-expect-error
            numberModule.addBinding(dupeNumberBinding.named('num'));
            numberModule.addBinding(dupeNumberBinding.named('<name>'));

            withBazModule.addBinding(dupeNumberBinding);
            // @ts-expect-error
            withBazModule.addBinding(dupeNumberBinding.named('num'));
            withBazModule.addBinding(dupeNumberBinding.named('<name>'));

            fooModule.addBinding(dupeNumberBinding);

            expect(() => {
                // @ts-expect-error
                aOrBModule.addBinding(aOrBBinding);
            })
                .to.throw(HaystackModuleValidationError)
                .contains({
                    message: 'Duplicate output identifier for module: <custom-name>(named: AorB)',
                });

            const symNumberBinding = bind(numberId.named(uniqueSym)).withInstance(123);
            expect(() => {
                module
                    .addBinding(numberBinding.named(uniqueSym))
                    // @ts-expect-error
                    .addBinding(symNumberBinding);
            })
                .to.throw(HaystackModuleValidationError)
                .contains({
                    message:
                        'Duplicate output identifier for module: haystack-id(named: Symbol(abc))',
                });

            expect(() => {
                // @ts-expect-error
                barModule.addBinding(
                    bind(identifier(Bar).nullable().undefinable()).withInstance({} as Bar)
                );
            })
                .to.throw(HaystackModuleValidationError)
                .contains({
                    message: 'Duplicate output identifier for module: Bar',
                });

            const dependencyOnUnnamedFoo = withBarModule.addBinding(
                bind(identifier<'<val>'>())
                    .withDependencies([Foo])
                    .withProvider(() => '<val>')
            );
            // @ts-expect-error
            createContainer(dependencyOnUnnamedFoo);
        });

        test('mergeModule', () => {
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

            module.mergeModule(createModule(dupNumBinding));
            module.mergeModule(createModule(dupNumBinding.named('<name>')));
            // @ts-expect-error
            module.mergeModule(createModule(dupNumBinding.named('num')));

            expect(() => {
                // @ts-expect-error
                module.mergeModule(module);
            })
                .to.throw(HaystackModuleValidationError)
                .contains({
                    message: [
                        'Duplicate output identifier for module: <custom-name>(named: AorB)',
                        'haystack-id(named: num)',
                    ].join(', '),
                });

            expect(() => {
                // @ts-expect-error
                module.mergeModule(fooModule.mergeModule(numberModule));
            })
                .to.throw(HaystackModuleValidationError)
                .contains({
                    message: 'Duplicate output identifier for module: haystack-id(named: num)',
                });

            const symNumberModule = createModule(bind(numberId.named(uniqueSym)).withInstance(123));
            expect(() => {
                module
                    .addBinding(numberBinding.named(uniqueSym))
                    // @ts-expect-error
                    .mergeModule(symNumberModule);
            })
                .to.throw(HaystackModuleValidationError)
                .contains({
                    message:
                        'Duplicate output identifier for module: haystack-id(named: Symbol(abc))',
                });

            const dependencyOnUnnamedFoo = withFooModule.mergeModule(
                createModule(
                    bind(identifier<'<val>'>())
                        .withDependencies([Foo])
                        .withProvider(() => '<val>')
                )
            );
            // @ts-expect-error
            createContainer(dependencyOnUnnamedFoo);
        });
    });
});
