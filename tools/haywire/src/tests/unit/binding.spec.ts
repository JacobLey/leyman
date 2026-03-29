import type {
    AsyncSupplier,
    GenericHaywireId,
    HaywireId,
    LateBinding,
    MultiList,
    Supplier,
} from 'haywire';
import type { BindingBuilder } from '#binding';
import type { AbstractPrivateClass } from '#identifier';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import {
    bind,
    Binding,
    HaywireContainerValidationError,
    identifier,
    optimisticSingletonScope,
    requestScope,
    transientScope,
} from 'haywire';
import { TempBinding } from '#binding';
import { expect } from '../chai-hooks.js';

suite('bind', () => {
    abstract class Foo {
        public readonly val = 1;
    }
    const fooBind = bind(Foo);
    expectTypeOf(fooBind).toEqualTypeOf<
        BindingBuilder<
            HaywireId<Foo, AbstractPrivateClass, null, false, false, false, false, false>
        >
    >();

    class ExtendsFoo extends Foo {
        public readonly val2 = 2;
        public constructor() {
            super();
        }
    }
    const extendsFooBind = bind(ExtendsFoo);

    class Bar {
        public readonly val: string;
        protected constructor(val: string) {
            this.val = val;
        }
    }
    const barBind = bind(identifier(Bar).nullable());
    expectTypeOf(barBind).toEqualTypeOf<
        BindingBuilder<HaywireId<Bar, AbstractPrivateClass, null, false, true, false, false, false>>
    >();

    class ExtendsBar extends Bar {
        public readonly val2: number;
        public constructor(val2: number) {
            super(val2.toString());
            this.val2 = val2;
        }
    }
    const extendsBarBind = bind(identifier(ExtendsBar).undefinable());

    class Egg {
        public readonly egg: LateBinding<Egg>;
        public constructor(egg: LateBinding<Egg>) {
            this.egg = egg;
        }
    }
    const eggBind = bind(Egg);
    class Chicken {
        public readonly egg: Egg;
        public constructor(egg: Egg) {
            this.egg = egg;
        }
    }
    const chickenBind = bind(Chicken);

    interface Thing {
        stuff: () => unknown[];
    }
    const thingId = identifier<Thing>();
    const thingBind = bind(thingId);

    const kindaThingId = thingId.named('<name>').nullable().undefinable().supplier().lateBinding();
    const kindaThingBind = bind(kindaThingId);

    const promisishId = identifier<789 | Promise<123>>();
    const promisishBind = bind(promisishId);

    suite('instance', () => {
        const foo = Reflect.construct(Foo, []) as Foo;

        test('list(false)', () => {
            const fooBinding = fooBind.withInstance(foo);

            expect(fooBinding.depIds).to.deep.equal([]);
            expect(fooBinding.provider()).to.equal(foo);

            barBind.withInstance(null);

            const extendsBarBinding = extendsBarBind.withInstance(new ExtendsBar(123));
            expectTypeOf(
                new Binding(
                    identifier(ExtendsBar),
                    [],
                    false,
                    () => new ExtendsBar(456)
                ).undefinable()
            ).toEqualTypeOf(extendsBarBinding);

            const thingBinding = thingBind.withInstance({
                stuff: () => [],
            });
            expectTypeOf(thingBinding).toEqualTypeOf<Binding<typeof thingId, [], false>>();
            expect(thingBinding.scope).to.equal(optimisticSingletonScope);

            kindaThingBind.withInstance({
                stuff: () => [],
            });
            kindaThingBind.withInstance(null);

            promisishBind.withInstance(Promise.resolve(123));
            promisishBind.withInstance(789);

            // @ts-expect-error
            extendsFooBind.withInstance(new Foo()); // eslint-disable-line @typescript-eslint/no-unsafe-argument
            // @ts-expect-error
            barBind.withInstance();
            // @ts-expect-error
            thingBind.withInstance(null);
        });

        test('list(true)', () => {
            const fooBinding = bind(identifier(Foo).list());

            const instanceBinding = fooBinding.withInstance(foo);
            expectTypeOf(instanceBinding.provider()).toEqualTypeOf<MultiList<Foo>>();
            expect(instanceBinding.provider()).to.deep.equal([foo]);

            fooBinding
                // @ts-expect-error - array is not a single element
                .withInstance([foo]);
        });

        test('list(multi)', () => {
            const bar = new ExtendsBar(123);

            const barBinding = bind(identifier(Bar).nullable().list('multi'));
            const instanceBinding = barBinding.withInstance([null, bar]);
            expectTypeOf(instanceBinding.provider()).toEqualTypeOf<MultiList<Bar | null>>();
            expect(instanceBinding.provider()).to.deep.equal([null, bar]);

            // Nullable multi may return null directly, treated as a single null element
            expect(barBinding.withInstance(null).provider()).to.deep.equal([null]);

            barBinding
                // @ts-expect-error - single element is not an array
                .withInstance(bar);
        });
    });

    suite('constructor', () => {
        test('list(false)', () => {
            // @ts-expect-error
            fooBind.withConstructorGenerator();

            const extendsFooBinding = extendsFooBind.withConstructorGenerator();
            expect(extendsFooBinding.scope).to.deep.equal(transientScope);
            expect(extendsFooBinding.depIds).to.deep.equal([]);
            expectTypeOf(extendsFooBinding.depIds).toEqualTypeOf<readonly []>();
            expect(extendsFooBinding.provider()).to.be.an.instanceOf(ExtendsFoo);
            expectTypeOf(extendsFooBinding.provider()).toEqualTypeOf<ExtendsFoo>();

            // @ts-expect-error
            barBind.withConstructorGenerator();
            // @ts-expect-error
            extendsBarBind.withConstructorGenerator();
            // @ts-expect-error
            eggBind.withConstructorGenerator();
            // @ts-expect-error
            chickenBind.withConstructorGenerator();
            // @ts-expect-error
            thingBind.withConstructorGenerator();
            // @ts-expect-error
            promisishBind.withConstructorGenerator();
        });

        test('list(true)', () => {
            const listExtendsFooBind = bind(
                identifier(ExtendsFoo).list().nullable().supplier('async')
            );
            const extendsFooBinding = listExtendsFooBind.withConstructorGenerator();
            const extendsFoo = extendsFooBinding.provider();
            expectTypeOf(extendsFoo).toEqualTypeOf<MultiList<ExtendsFoo | null>>();
            expect(extendsFoo).to.have.length(1);
            expect(extendsFoo[0]).to.be.an.instanceOf(ExtendsFoo);

            bind(identifier(Foo).list())
                // @ts-expect-error
                .withConstructorGenerator();
            bind(identifier(Bar).list())
                // @ts-expect-error
                .withConstructorGenerator();
            bind(promisishId.list())
                // @ts-expect-error
                .withConstructorGenerator();
        });

        test('list(multi)', () => {
            const multiExtendsFooBind = bind(
                identifier(ExtendsFoo).list('multi').undefinable().lateBinding()
            );

            const extendsFooBinding = multiExtendsFooBind.withConstructorGenerator();
            const extendsFoo = extendsFooBinding.provider();
            expectTypeOf(extendsFoo).toEqualTypeOf<MultiList<ExtendsFoo | undefined>>();
            expect(extendsFoo).to.have.length(1);
            expect(extendsFoo[0]).to.be.an.instanceOf(ExtendsFoo);

            bind(identifier(Foo).list('multi'))
                // @ts-expect-error
                .withConstructorGenerator();
            bind(identifier(Bar).list('multi'))
                // @ts-expect-error
                .withConstructorGenerator();
            bind(promisishId.list('multi'))
                // @ts-expect-error
                .withConstructorGenerator();
        });
    });

    suite('constructor provider', () => {
        test('list(false)', () => {
            // @ts-expect-error
            fooBind.withConstructorProvider();

            const extendsFooProvider = extendsFooBind.withConstructorProvider();
            expect(extendsFooProvider.withDependencies([]).provider()).to.be.an.instanceOf(
                ExtendsFoo
            );
            // @ts-expect-error
            extendsFooProvider.withDependencies([Bar]);

            // @ts-expect-error
            barBind.withConstructorProvider();

            expectTypeOf(
                extendsBarBind
                    .withConstructorProvider()
                    .withDependencies([identifier<number>()])
                    .provider(123)
            ).toEqualTypeOf<ExtendsBar | undefined>();

            const eggProvider = eggBind.withConstructorProvider();
            eggProvider.withDependencies([identifier(Egg).lateBinding()]);
            // @ts-expect-error
            eggProvider.withDependencies([identifier(Egg)]);

            const chickenProvider = chickenBind.withConstructorProvider();
            chickenProvider.withDependencies([Egg]);
            // @ts-expect-error
            chickenProvider.withDependencies([identifier(Egg).lateBinding()]);

            // @ts-expect-error
            promisishBind.withConstructorProvider();
        });

        test('list(true)', () => {
            const listExtendsFooBind = bind(identifier(ExtendsFoo).list());
            const extendsFooProvider = listExtendsFooBind.withConstructorProvider();
            const binding = extendsFooProvider.withDependencies([]);
            expectTypeOf(binding.provider()).toEqualTypeOf<MultiList<ExtendsFoo>>();
            expect(binding.provider()).to.have.length(1);
            expect(binding.provider()[0]).to.be.an.instanceOf(ExtendsFoo);

            const listExtendsBarBind = bind(identifier(ExtendsBar).undefinable().list());
            expectTypeOf(
                listExtendsBarBind
                    .withConstructorProvider()
                    .withDependencies([identifier<number>()])
                    .provider(123)
            ).toEqualTypeOf<MultiList<ExtendsBar | undefined>>();
        });

        test('list(multi)', () => {
            const multiExtendsFooBind = bind(identifier(ExtendsFoo).list('multi'));
            const extendsFooProvider = multiExtendsFooBind.withConstructorProvider();
            const binding = extendsFooProvider.withDependencies([]);
            expectTypeOf(binding.provider()).toEqualTypeOf<MultiList<ExtendsFoo>>();
            expect(binding.provider()).to.have.length(1);
            expect(binding.provider()[0]).to.be.an.instanceOf(ExtendsFoo);

            const multiExtendsBarBind = bind(
                identifier(ExtendsBar).nullable().list('multi')
            ).withConstructorProvider();
            // @ts-expect-error
            multiExtendsBarBind.withDependencies([identifier<number>().list('multi')]);
            expectTypeOf(
                multiExtendsBarBind.withDependencies([identifier<number>()]).provider(123)
            ).toEqualTypeOf<MultiList<ExtendsBar | null>>();
        });
    });

    suite('generator', () => {
        test('list(false)', () => {
            const fooBinding = fooBind.withGenerator(() => new ExtendsFoo());
            expectTypeOf(fooBinding).toEqualTypeOf<
                Binding<
                    HaywireId<Foo, AbstractPrivateClass, null, false, false, false, false, false>,
                    [],
                    false
                >
            >();
            // @ts-expect-error
            fooBind.withGenerator(() => new ExtendsBar());

            // @ts-expect-error
            extendsFooBind.withGenerator(() => null);

            barBind.withGenerator(() => null);
            extendsBarBind.withGenerator((): undefined => {});

            // @ts-expect-error
            thingBind.withGenerator((val: Thing) => val);

            promisishBind.withGenerator(async () => 123 as const);
            promisishBind.withGenerator(() => 789);
        });

        test('list(true)', async () => {
            const fooBinding = bind(identifier(Foo).list()).withGenerator(() => new ExtendsFoo());
            expectTypeOf(fooBinding.provider()).toEqualTypeOf<MultiList<Foo>>();
            expect(fooBinding.provider()).to.have.length(1);
            expect(fooBinding.provider()[0]).to.be.an.instanceOf(ExtendsFoo);

            bind(identifier(Foo).list()).withGenerator(
                // @ts-expect-error - array is not a single element
                () => [new ExtendsFoo()]
            );

            const promisish = bind(promisishId.list().nullable())
                .withGenerator(async () => 123 as const)
                .provider();
            expectTypeOf(promisish).toEqualTypeOf<MultiList<789 | Promise<123> | null>>();
            expect(promisish).to.have.length(1);
            expect(await Promise.all(promisish as Promise<unknown>[])).to.deep.equal([123]);
            expect(
                bind(promisishId.list().nullable())
                    .withGenerator(() => null)
                    .provider()
            ).to.deep.equal([null]);
        });

        test('list(multi)', async () => {
            const fooBinding = bind(identifier(Foo).list('multi')).withGenerator(() => [
                new ExtendsFoo(),
            ]);
            expectTypeOf(fooBinding.provider()).toEqualTypeOf<MultiList<Foo>>();
            expect(fooBinding.provider()).to.have.length(1);
            expect(fooBinding.provider()[0]).to.be.an.instanceOf(ExtendsFoo);

            bind(identifier(Foo).list('multi')).withGenerator(
                // @ts-expect-error - single element is not an array
                () => new ExtendsFoo()
            );

            const promisish = bind(promisishId.list('multi').undefinable())
                .withGenerator(() => [Promise.resolve(123), undefined, 789])
                .provider();
            expectTypeOf(promisish).toEqualTypeOf<MultiList<789 | Promise<123> | undefined>>();
            expect(promisish).to.have.length(3);
            expect(await Promise.all(promisish as Promise<unknown>[])).to.deep.equal([
                123,
                undefined,
                789,
            ]);
        });
    });

    suite('async generator', () => {
        test('list(false)', () => {
            const fooBinding = fooBind.withAsyncGenerator(() => new ExtendsFoo());
            expectTypeOf(fooBinding).toEqualTypeOf<
                Binding<
                    HaywireId<Foo, AbstractPrivateClass, null, false, false, false, false, false>,
                    [],
                    true
                >
            >();
            // @ts-expect-error
            fooBind.withAsyncGenerator(async () => new ExtendsBar());

            // @ts-expect-error
            extendsFooBind.withAsyncGenerator(async () => null);

            barBind.withAsyncGenerator(async () => null);
            extendsBarBind.withAsyncGenerator((): undefined => {});

            // @ts-expect-error
            thingBind.withAsyncGenerator(async (val: Thing) => val);

            // @ts-expect-error
            promisishBind.withAsyncGenerator(async () => {
                await Promise.resolve(123);
            });
        });

        test('list(true)', async () => {
            const fooBinding = bind(identifier(Foo).list()).withAsyncGenerator(
                () => new ExtendsFoo()
            );
            expectTypeOf(fooBinding.provider()).toEqualTypeOf<
                MultiList<Foo> | Promise<MultiList<Foo>>
            >();
            const foos = await fooBinding.provider();
            expect(foos).to.have.length(1);
            expect(foos[0]).to.be.an.instanceOf(ExtendsFoo);

            bind(identifier(Foo).list()).withAsyncGenerator(
                // @ts-expect-error - array is not a single element
                () => [new ExtendsFoo()]
            );

            const promisishBound = bind(promisishId.list().nullable());
            // @ts-expect-error
            promisishBound.withAsyncGenerator(async () => 789 as const);
        });

        test('list(multi)', async () => {
            const fooBinding = bind(
                identifier(Foo).list('multi').undefinable().lateBinding()
            ).withAsyncGenerator(async () => [new ExtendsFoo(), undefined]);
            expectTypeOf(fooBinding.provider()).toEqualTypeOf<
                MultiList<Foo | undefined> | Promise<MultiList<Foo | undefined>>
            >();
            const foos = await fooBinding.provider();
            expect(foos).to.have.length(2);
            expect(foos[0]).to.be.an.instanceOf(ExtendsFoo);
            expect(foos).to.deep.equal([foos[0], undefined]);

            // Undefinable multi may resolve undefined directly, treated as a single element
            expect(
                await bind(identifier(Foo).list('multi').undefinable())
                    .withAsyncGenerator(async () => {})
                    .provider()
            ).to.deep.equal([undefined]);

            bind(identifier(Foo).list('multi')).withGenerator(
                // @ts-expect-error - single element is not an array
                () => new ExtendsFoo()
            );

            const promisish = await bind(promisishId.list('multi').undefinable())
                .withAsyncGenerator(() => [Promise.resolve(123), undefined, 789])
                .provider();
            expectTypeOf(promisish).toEqualTypeOf<MultiList<789 | Promise<123> | undefined>>();
            expect(promisish).to.have.length(3);
            expect(await Promise.all(promisish as Promise<unknown>[])).to.deep.equal([
                123,
                undefined,
                789,
            ]);
        });
    });

    suite('provider', () => {
        test('list(false)', () => {
            const fooProvider = fooBind.withProvider(() => new ExtendsFoo());
            expectTypeOf(fooProvider.withDependencies([])).toEqualTypeOf<
                Binding<
                    HaywireId<Foo, AbstractPrivateClass, null, false, false, false, false, false>,
                    [],
                    false
                >
            >();
            // @ts-expect-error
            fooProvider.withDependencies([Foo]);

            // @ts-expect-error
            extendsFooBind.withProvider(() => ({}) as Foo);
            // @ts-expect-error
            extendsFooBind.withProvider(async () => new ExtendsFoo());

            const barProviderBinding = barBind.withProvider((bar: Bar) => bar);
            barProviderBinding.withDependencies([ExtendsBar]);

            const extendsBarProviderBinding = barBind.withProvider(
                (extendsBar: ExtendsBar) => extendsBar
            );
            // @ts-expect-error
            extendsBarProviderBinding.withDependencies([Bar]);
            // @ts-expect-error
            barProviderBinding.withDependencies([identifier(ExtendsBar).nullable()]);
            // @ts-expect-error
            barProviderBinding.withDependencies([identifier(ExtendsBar).supplier()]);

            const bindingDependsOnNumberMaker = bind(identifier<number>()).withProvider(
                (makeNumber: () => number) => makeNumber()
            );
            bindingDependsOnNumberMaker.withDependencies([identifier<() => number>()]);
            // @ts-expect-error
            bindingDependsOnNumberMaker.withDependencies([identifier<number>().supplier()]);

            const extendsBarProvider = extendsBarBind.withProvider(
                (val: (string | null)[]) => new ExtendsBar((val[0] ?? 'abc').length)
            );
            // @ts-expect-error
            extendsBarProvider.withDependencies([identifier<string>().list('multi')]);
            // @ts-expect-error
            extendsBarProvider.withDependencies([identifier<string>().list()]);
            extendsBarProvider.withDependencies([identifier<string[]>()]);
            expectTypeOf(
                extendsBarProvider.withDependencies([identifier<string[]>()])
            ).toEqualTypeOf<
                Binding<
                    HaywireId<
                        ExtendsBar,
                        typeof ExtendsBar,
                        null,
                        false,
                        false,
                        true,
                        false,
                        false
                    >,
                    [HaywireId<string[], null, null, false, false, false, false, false>],
                    false
                >
            >();
            // @ts-expect-error
            extendsBarProvider.withDependencies([]);

            promisishBind.withProvider(() => 789).withDependencies([]);

            bind(identifier<number>())
                .withProvider(
                    (
                        ...args: [
                            LateBinding<Supplier<string>>,
                            AsyncSupplier<MultiList<number | null>>,
                            LateBinding<MultiList<boolean | undefined>>,
                        ]
                    ) => args.length
                )
                .withDependencies([
                    identifier<string>().lateBinding().supplier(),
                    identifier<number>().supplier('async').list(),
                    identifier<boolean>().lateBinding().list('multi').undefinable(),
                ]);
        });

        test('list(true)', () => {
            const listFooBind = bind(identifier(Foo).list());
            const fooProvider = listFooBind.withProvider(() => new ExtendsFoo());
            const fooBinding = fooProvider.withDependencies([]);
            expectTypeOf(fooBinding.provider()).toEqualTypeOf<MultiList<Foo>>();
            expect(fooBinding.provider()).to.have.length(1);
            expect(fooBinding.provider()[0]).to.be.an.instanceOf(ExtendsFoo);

            listFooBind.withProvider(
                // @ts-expect-error - array is not a single element
                () => [new ExtendsFoo()]
            );
        });

        test('list(multi)', () => {
            const listFooBind = bind(identifier(Foo).list('multi'));
            const fooProvider = listFooBind.withProvider(() => [new ExtendsFoo()]);
            const fooBinding = fooProvider.withDependencies([]);
            expectTypeOf(fooBinding.provider()).toEqualTypeOf<MultiList<Foo>>();
            expect(fooBinding.provider()).to.have.length(1);
            expect(fooBinding.provider()[0]).to.be.an.instanceOf(ExtendsFoo);

            listFooBind.withProvider(
                // @ts-expect-error - single element is not an array
                () => new ExtendsFoo()
            );
        });
    });

    suite('async provider', () => {
        test('list(false)', () => {
            const fooProvider = fooBind.withAsyncProvider(() => new ExtendsFoo());
            expectTypeOf(fooProvider.withDependencies([])).toEqualTypeOf<
                Binding<
                    HaywireId<Foo, AbstractPrivateClass, null, false, false, false, false, false>,
                    [],
                    true
                >
            >();
            // @ts-expect-error
            fooProvider.withDependencies([Foo]);

            // @ts-expect-error
            extendsFooBind.withAsyncProvider(async () => ({}) as Foo);

            const barProviderBinding = barBind.withAsyncProvider(async (bar: Bar) => bar);
            const extendsBarProviderBinding = barBind.withAsyncProvider(
                async (extendsBar: ExtendsBar) => extendsBar
            );

            barProviderBinding.withDependencies([ExtendsBar]);
            // @ts-expect-error
            extendsBarProviderBinding.withDependencies([identifier(ExtendsBar).undefinable()]);
            // @ts-expect-error
            extendsBarProviderBinding.withDependencies([identifier(ExtendsBar).lateBinding()]);

            // @ts-expect-error
            extendsBarProviderBinding.withDependencies([Bar]);

            const bindingDependsOnStringProm = bind(identifier<string>()).withAsyncProvider(
                async (resolveString: Promise<string>) => resolveString
            );
            bindingDependsOnStringProm.withDependencies([identifier<Promise<string>>()]);
            // @ts-expect-error
            bindingDependsOnStringProm.withDependencies([
                identifier<Promise<string>>().lateBinding(),
            ]);

            const extendsBarProvider = extendsBarBind.withAsyncProvider(
                async (val: string | undefined) => new ExtendsBar(val?.length ?? 0)
            );
            extendsBarProvider.withDependencies([identifier<string>()]);
            expectTypeOf(
                extendsBarProvider.withDependencies([identifier<string>().undefinable()])
            ).toEqualTypeOf<
                Binding<
                    HaywireId<
                        ExtendsBar,
                        typeof ExtendsBar,
                        null,
                        false,
                        false,
                        true,
                        false,
                        false
                    >,
                    [HaywireId<string, null, null, false, false, true, false, false>],
                    true
                >
            >();
            // @ts-expect-error
            extendsBarProvider.withDependencies([]);

            // @ts-expect-error
            promisishBind.withAsyncProvider(async () => 123);

            bind(identifier<number>())
                .withAsyncProvider(
                    (
                        ...args: [
                            LateBinding<AsyncSupplier<MultiList<string | undefined>>>,
                            MultiList<number>,
                        ]
                    ) => args.length
                )
                .withDependencies([
                    identifier<string>().lateBinding().supplier('async').list().undefinable(),
                    identifier<number>().list('multi'),
                ]);
        });

        test('list(true)', async () => {
            const listThingBind = bind(thingId.list());
            const thing: Thing = { stuff: () => [] };
            const thingProvider = listThingBind.withAsyncProvider(() => thing);
            const thingBinding = thingProvider.withDependencies([]);
            expectTypeOf(await thingBinding.provider()).toEqualTypeOf<MultiList<Thing>>();
            expect(await thingBinding.provider()).to.deep.equal([thing]);

            listThingBind.withAsyncProvider(
                // @ts-expect-error - array is not a single element
                async () => [thing]
            );
        });

        test('list(multi)', async () => {
            const listThingBind = bind(thingId.list('multi'));
            const thingProvider = listThingBind.withAsyncProvider(
                (x: (string | null)[] | undefined, y: MultiList<number | null>) => [
                    { stuff: () => x ?? [] },
                    { stuff: () => y },
                ]
            );
            const thingBinding = thingProvider.withDependencies([
                identifier<string[]>().undefinable(),
                identifier<number>().list('multi').nullable(),
            ]);
            const val = await thingBinding.provider(['abc'], [123] as MultiList<123>);
            expectTypeOf(val).toEqualTypeOf<MultiList<Thing>>();
            expect(val[0]!.stuff()).to.deep.equal(['abc']);

            listThingBind.withAsyncProvider(
                // @ts-expect-error - single element is not an array
                async () => ({ stuff: () => [] })
            );
        });
    });

    suite('dependencies', () => {
        const fooDependencies = fooBind.withDependencies([identifier<'ignored'>().list('multi')]);
        const extendsFooDependencies = extendsFooBind.withDependencies([]);

        class OtherBar extends ExtendsBar {
            public readonly otherVal = 123;
        }
        const barDependencies = barBind.withDependencies([
            identifier<'a' | 'b'>().named('<name>').supplier(),
            identifier<'a' | 'b'>().named('<name>').supplier('async'),
        ]);
        const aOrBSupplier = (() => 'a') as Supplier<'a'>;
        const aOrBAsyncSupplier = (async () => 'b') as AsyncSupplier<'b'>;
        const extendsBarDependencies = extendsBarBind.withDependencies([
            OtherBar,
            identifier<[number, number]>().nullable().lateBinding().list(),
            identifier<number>().undefinable().supplier(),
            identifier<boolean>().supplier('async'),
        ]);

        const eggDependencies = eggBind.withDependencies([identifier(Egg).lateBinding()]);
        const chickenDependencies = chickenBind.withDependencies([Egg]);

        const thingDependencies = thingBind.withDependencies([identifier<string[]>()]);

        const promisishDependencies = promisishBind.withDependencies([]);

        suite('constructor provider', () => {
            test('list(false)', () => {
                const extendsFooBinding = extendsFooDependencies.withConstructorProvider();
                expect(extendsFooBinding.provider()).to.be.an.instanceOf(ExtendsFoo);

                // @ts-expect-error
                fooDependencies.withConstructorProvider();
                // @ts-expect-error
                barDependencies.withConstructorProvider();

                // @ts-expect-error
                extendsBarDependencies.withConstructorProvider();
                extendsBarBind.withDependencies([identifier<number>()]).withConstructorProvider();
                extendsBarBind
                    .withDependencies([identifier<number>(), identifier<'ignore'>()])
                    .withConstructorProvider();

                eggDependencies.withConstructorProvider();
                chickenDependencies.withConstructorProvider();
                // @ts-expect-error
                chickenBind.withDependencies([]).withConstructorProvider();

                // @ts-expect-error
                thingDependencies.withConstructorProvider();

                // @ts-expect-error
                promisishDependencies.withConstructorProvider();
            });

            test('list(true)', () => {
                const listExtendsFooDeps = bind(identifier(ExtendsFoo).list()).withDependencies([]);
                const binding = listExtendsFooDeps.withConstructorProvider();
                expectTypeOf(binding.provider()).toEqualTypeOf<MultiList<ExtendsFoo>>();
                expect(binding.provider()).to.have.length(1);
                expect(binding.provider()[0]).to.be.an.instanceOf(ExtendsFoo);
            });

            test('list(multi)', () => {
                const multiExtendsFooDeps = bind(
                    identifier(ExtendsFoo).list('multi').lateBinding().nullable()
                ).withDependencies([identifier<{ foo: boolean }>()]);
                const binding = multiExtendsFooDeps.withConstructorProvider();
                expectTypeOf(binding.provider({ foo: true })).toEqualTypeOf<
                    MultiList<ExtendsFoo | null>
                >();
                expect(binding.provider({ foo: false })).to.have.length(1);
                expect(binding.provider({ foo: true })[0]).to.be.an.instanceOf(ExtendsFoo);
            });
        });

        suite('provider', () => {
            test('list(false)', () => {
                const fooBinding = fooDependencies.withProvider(() => new ExtendsFoo());
                expectTypeOf(
                    fooDependencies.withProvider(ignored => {
                        expectTypeOf(ignored).toEqualTypeOf<MultiList<'ignored'>>();
                        return new ExtendsFoo();
                    })
                ).toEqualTypeOf(fooBinding);
                expect(
                    fooBinding.provider(['ignored'] as MultiList<'ignored'>)
                ).to.be.an.instanceOf(Foo);
                fooDependencies.withProvider(
                    // @ts-expect-error
                    () => 123
                );

                extendsFooDependencies.withProvider(() => new ExtendsFoo());
                extendsFooDependencies.withProvider(
                    // @ts-expect-error
                    (val: ExtendsFoo) => val
                );

                const barBinding = barDependencies.withProvider((aOrB, asyncAOrB) => {
                    expectTypeOf(aOrB).toEqualTypeOf<Supplier<'a' | 'b'>>();
                    expectTypeOf(asyncAOrB).toEqualTypeOf<AsyncSupplier<'a' | 'b'>>();
                    return Math.random() < 1 ? new ExtendsBar(123) : null;
                });
                expect(barBinding.provider(aOrBSupplier, aOrBAsyncSupplier)!.val).to.equal('123');
                expectTypeOf(
                    barBinding.provider(aOrBSupplier, aOrBAsyncSupplier)
                ).toEqualTypeOf<Bar | null>();
                // @ts-expect-error
                barBinding.provider(aOrBAsyncSupplier, aOrBSupplier);
                // @ts-expect-error
                barBinding.provider('c');

                extendsBarDependencies.withProvider(
                    (otherBar, lateNullable, undefinedSupplier, asyncSupplier) => {
                        expectTypeOf(lateNullable).toEqualTypeOf<
                            LateBinding<MultiList<[number, number] | null>>
                        >();
                        expectTypeOf(undefinedSupplier).toEqualTypeOf<
                            Supplier<number | undefined>
                        >();
                        expectTypeOf(asyncSupplier).toEqualTypeOf<AsyncSupplier<boolean>>();
                        return otherBar;
                    }
                );

                eggDependencies.withProvider(lateEgg => new Egg(lateEgg));
                chickenDependencies.withProvider(egg => new Chicken(egg));

                thingDependencies.withProvider(stuff => ({
                    other: true,
                    stuff: () => stuff,
                }));
                thingDependencies.withProvider(
                    // @ts-expect-error
                    (wrong: number) => ({ wrong, stuff: () => [] })
                );

                promisishDependencies.withProvider(async () => 123 as const);
            });

            test('list(true)', () => {
                const listFooDeps = bind(identifier(Foo).list()).withDependencies([
                    identifier<'ignored'>(),
                ]);
                const fooBinding = listFooDeps.withProvider(() => new ExtendsFoo());
                expectTypeOf(fooBinding.provider('ignored')).toEqualTypeOf<MultiList<Foo>>();
                expect(fooBinding.provider('ignored')).to.have.length(1);
                expect(fooBinding.provider('ignored')[0]).to.be.an.instanceOf(Foo);

                listFooDeps.withProvider(
                    // @ts-expect-error - array is not a single element
                    () => [new ExtendsFoo()]
                );
            });

            test('list(multi)', () => {
                const listFooDeps = bind(
                    identifier(Foo).list('multi').nullable().supplier()
                ).withDependencies([identifier<'ignored'>()]);
                const fooBinding = listFooDeps.withProvider(() => [new ExtendsFoo(), null]);
                expectTypeOf(fooBinding.provider('ignored')).toEqualTypeOf<MultiList<Foo | null>>();
                expect(fooBinding.provider('ignored')).to.have.length(2);
                expect(fooBinding.provider('ignored')[0]).to.be.an.instanceOf(Foo);

                listFooDeps.withProvider(
                    // @ts-expect-error - single element is not an array
                    () => new ExtendsFoo()
                );
            });
        });

        suite('async provider', () => {
            test('list(false)', async () => {
                expectTypeOf(
                    fooDependencies.withAsyncProvider(() => ({}) as ExtendsFoo)
                ).toEqualTypeOf(
                    fooDependencies.withAsyncProvider(async ignored => {
                        expectTypeOf(ignored).toEqualTypeOf<MultiList<'ignored'>>();
                        return {} as Foo;
                    })
                );
                fooDependencies.withAsyncProvider(
                    // @ts-expect-error
                    async () => 123
                );

                extendsFooDependencies.withAsyncProvider(async () => new ExtendsFoo());
                extendsFooDependencies.withAsyncProvider(
                    // @ts-expect-error
                    async (val: ExtendsFoo) => val
                );

                const barBinding = barDependencies.withAsyncProvider(async (aOrB, asyncAOrB) => {
                    expectTypeOf(aOrB).toEqualTypeOf<Supplier<'a' | 'b'>>();
                    expectTypeOf(asyncAOrB).toEqualTypeOf<AsyncSupplier<'a' | 'b'>>();
                    return Math.random() < 1 ? Promise.resolve(new ExtendsBar(123)) : null;
                });
                expect((await barBinding.provider(aOrBSupplier, aOrBAsyncSupplier))!.val).to.equal(
                    '123'
                );

                eggDependencies.withAsyncProvider(lateEgg => new Egg(lateEgg));
                chickenDependencies.withAsyncProvider(async () => new Chicken({} as Egg));

                thingDependencies.withAsyncProvider(async stuff => ({
                    other: true,
                    stuff: () => stuff,
                }));
                thingDependencies.withAsyncProvider(
                    // @ts-expect-error
                    async (wrong: number) => ({ wrong, stuff: () => [] })
                );

                // @ts-expect-error
                promisishDependencies.withAsyncProvider(async () => 123);
            });

            test('list(true)', async () => {
                const listFooDeps = bind(identifier(Foo).list().undefinable()).withDependencies([
                    identifier<'ignored'>(),
                ]);
                const fooBinding = listFooDeps.withAsyncProvider(async () => new ExtendsFoo());
                expectTypeOf(await fooBinding.provider('ignored')).toEqualTypeOf<
                    MultiList<Foo | undefined>
                >();
                const result = await fooBinding.provider('ignored');
                expect(result).to.have.length(1);
                expect(result[0]).to.be.an.instanceOf(Foo);
                listFooDeps.withAsyncProvider(async (): Promise<undefined> => {});

                listFooDeps.withAsyncProvider(
                    // @ts-expect-error - array is not a single element
                    async () => [new ExtendsFoo()]
                );
            });

            test('list(multi)', async () => {
                const listFooDeps = bind(identifier(Foo).list('multi')).withDependencies([
                    identifier<'ignored'>().nullable(),
                ]);
                const fooBinding = listFooDeps.withAsyncProvider(() => [new ExtendsFoo()]);
                expectTypeOf(await fooBinding.provider(null)).toEqualTypeOf<MultiList<Foo>>();
                const result = await fooBinding.provider('ignored');
                expect(result).to.have.length(1);
                expect(result[0]).to.be.an.instanceOf(Foo);

                listFooDeps.withAsyncProvider(
                    // @ts-expect-error - single element is not an array
                    async () => new ExtendsFoo()
                );
            });
        });
    });
});

suite('binding', () => {
    const binding = bind(identifier<'2' | 1 | true>())
        .withDependencies([identifier<boolean>()])
        .withProvider(which => (which ? 1 : '2'));
    const uniqueSym = Symbol('abc');

    type BindingImplementation<
        Name extends string | symbol | null,
        List extends boolean,
        Nullable extends boolean,
        Undefinable extends boolean,
        Async extends boolean,
    > = Binding<
        HaywireId<'2' | 1 | true, null, Name, List, Nullable, Undefinable, false, false>,
        [HaywireId<boolean, null, null, false, false, false, false, false>],
        Async
    >;

    expectTypeOf(binding).toEqualTypeOf<BindingImplementation<null, false, false, false, false>>();

    test('named', () => {
        const namedBinding = binding.named('name');
        expect(namedBinding).to.not.equal(binding);
        expect(namedBinding.named('name')).to.equal(namedBinding);

        expectTypeOf(namedBinding).toEqualTypeOf<
            BindingImplementation<'name', false, false, false, false>
        >();

        expectTypeOf(namedBinding.named()).toEqualTypeOf(binding);
        expectTypeOf(namedBinding.named()).toEqualTypeOf(namedBinding.named(null));

        // @ts-expect-error
        binding.named(Math.random() < 0.5 ? ('a' as const) : ('b' as const));
        // @ts-expect-error
        binding.named(Math.random() < 0.5 ? ('a' as const) : uniqueSym);
        // @ts-expect-error
        binding.named(Symbol.for('abc'));
    });

    test('nullable', () => {
        const nullableBinding = binding.nullable();
        expectTypeOf(nullableBinding).toEqualTypeOf<
            BindingImplementation<null, false, true, false, false>
        >();
        expectTypeOf(nullableBinding).toEqualTypeOf(binding.nullable(true));
        expect(nullableBinding).to.not.equal(binding);
        expect(nullableBinding).to.equal(nullableBinding.nullable());
        // @ts-expect-error
        binding.nullable(false);

        expectTypeOf(nullableBinding.provider(true)).toEqualTypeOf<'2' | 1 | true | null>();
    });

    test('undefinable', () => {
        const undefinableBinding = binding.undefinable();
        expectTypeOf(undefinableBinding).toEqualTypeOf<
            BindingImplementation<null, false, false, true, false>
        >();
        expectTypeOf(undefinableBinding).toEqualTypeOf(binding.undefinable(true));
        expect(undefinableBinding).to.not.equal(binding);
        expect(undefinableBinding).to.equal(undefinableBinding.undefinable());
        // @ts-expect-error
        binding.undefinable(false);

        expectTypeOf(undefinableBinding.provider(true)).toEqualTypeOf<'2' | 1 | true | undefined>();
    });

    test('list', () => {
        const listBinding = binding.list();
        expectTypeOf(listBinding).toEqualTypeOf<
            BindingImplementation<null, true, false, false, false>
        >();
        expectTypeOf(listBinding).toEqualTypeOf(binding.list(true));
        expect(listBinding).to.not.equal(binding);
        expect(listBinding).to.equal(listBinding.list());
        // @ts-expect-error
        binding.list(false);

        expectTypeOf(listBinding.provider(true)).toEqualTypeOf<MultiList<'2' | 1 | true>>();
        expect(listBinding.provider(false)).to.deep.equal(['2']);
    });

    test('binding changes update outputId', () => {
        expectTypeOf(binding.named('other-name').nullable().undefinable().list()).toEqualTypeOf<
            BindingImplementation<'other-name', true, true, true, false>
        >();
        expect(binding.named('other-name').nullable().undefinable().list().outputId).to.equal(
            binding.outputId.named('other-name').nullable().undefinable().list()
        );
        expectTypeOf(
            binding.named('other-name').nullable().undefinable().list().outputId
        ).toEqualTypeOf(binding.outputId.named('other-name').nullable().undefinable().list());

        expectTypeOf(binding.named(uniqueSym).nullable().undefinable().list()).toEqualTypeOf<
            BindingImplementation<typeof uniqueSym, true, true, true, false>
        >();
        expect(binding.named(uniqueSym).nullable().undefinable().list().outputId).to.equal(
            binding.outputId.named(uniqueSym).nullable().undefinable().list()
        );
        expectTypeOf(
            binding.named(uniqueSym).nullable().undefinable().list().outputId
        ).toEqualTypeOf(binding.outputId.named(uniqueSym).nullable().undefinable().list());
    });

    test('scoped', () => {
        expect(binding.scope).to.equal(transientScope);
        expect(binding.scoped(requestScope).scope).to.equal(requestScope);
        expect(binding.scoped(requestScope)).to.not.equal(binding);
        expectTypeOf(binding.scoped(requestScope)).toEqualTypeOf(binding);
    });

    test('dependencyIds', () => {
        expect(binding.dependencyIds).to.equal(binding.depIds);
        expectTypeOf(binding.dependencyIds).toEqualTypeOf<readonly GenericHaywireId[]>();
    });
});

suite('TempBinding', () => {
    const id = identifier<number>();

    const binding = new TempBinding(id);

    expectTypeOf(binding).toEqualTypeOf(bind(id).withGenerator(() => 123));

    expect(() => {
        binding.provider();
    }).to.throw(HaywireContainerValidationError);
});
