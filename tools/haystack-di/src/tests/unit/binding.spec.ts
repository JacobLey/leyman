import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { type AsyncSupplier, Binding, HaystackId, identifier, bind, type LateBinding, type Supplier, GenericHaystackId, optimisticSingletonScope, transientScope, requestScope } from 'haystack-di';
import { suite, test } from 'mocha';
import { BindingBuilder } from '#binding';

suite('bind', () => {

    abstract class Foo {
        val = 1;
    }
    const fooBind = bind(Foo);
    expectTypeOf(fooBind).toEqualTypeOf<
        BindingBuilder<HaystackId<Foo, null, null, false, false, false, false>>
    >();
    
    class ExtendsFoo extends Foo {
        val2 = 2;
        constructor() {
            super();
        }
    };
    const extendsFooBind = bind(ExtendsFoo);
    
    class Bar {
        protected constructor(public readonly val: string) {}
    }
    const barBind = bind(identifier(Bar).nullable());
    expectTypeOf(barBind).toEqualTypeOf<
        BindingBuilder<HaystackId<Bar, null, null, true, false, false, false>>
    >();

    class ExtendsBar extends Bar {
        constructor(public readonly val2: number) {
            super(val2.toString());
        }
    }
    const extendsBarBind = bind(identifier(ExtendsBar).undefinable());

    class Egg {
        constructor(public readonly egg: LateBinding<Egg>) {}
    }
    const eggBind = bind(Egg);
    class Chicken {
        constructor(public readonly egg: Egg) {}
    }
    const chickenBind = bind(Chicken);

    interface Thing {
        stuff: () => unknown[];
    }
    const thingId = identifier<Thing>();
    const thingBind = bind(thingId);

    const kindaThingId = thingId.named('<name>').nullable().undefinable().supplier().lateBinding();
    const kindaThingBind = bind(kindaThingId);

    const promisishId = identifier<Promise<123> | 789>();
    const promisishBind = bind(promisishId);

    test('Strips annotations', () => {

        expectTypeOf(
            bind(
                identifier(Foo).supplier().lateBinding()
            )
        ).toEqualTypeOf(fooBind);
        expectTypeOf(
            bind(
                identifier(Foo).supplier('async').lateBinding()
            )
        ).toEqualTypeOf(fooBind);

        expectTypeOf(
            kindaThingBind
        ).toEqualTypeOf<
            BindingBuilder<HaystackId<Thing, null, '<name>', true, true, false, false>>  
        >()
    });

    test('instance', () => {

        const foo = Reflect.construct(Foo, []) as Foo;

        const fooBinding = fooBind.withInstance(foo);

        expect(fooBinding.depIds).to.deep.equal([]);
        expect(fooBinding.provider()).to.equal(foo);

        barBind.withInstance(null);
        
        const extendsBarBinding = extendsBarBind.withInstance(new ExtendsBar(123));
        expectTypeOf(
            new Binding(identifier(ExtendsBar), [], false, () => new ExtendsBar(456)).undefinable()
        ).toEqualTypeOf(extendsBarBinding);

        const thingBinding = thingBind.withInstance({
            stuff: () => [],
        });
        expectTypeOf(thingBinding).toEqualTypeOf<
            Binding<typeof thingId, [], false>
        >();
        expect(thingBinding.scope).to.equal(optimisticSingletonScope);

        kindaThingBind.withInstance({
            stuff: () => [],
        });
        kindaThingBind.withInstance(null);

        promisishBind.withInstance(Promise.resolve(123));
        promisishBind.withInstance(789);

        // @ts-expect-error
        extendsFooBind.withInstance(new Foo());
        // @ts-expect-error
        barBind.withInstance(undefined);
        // @ts-expect-error
        thingBind.withInstance(null);
    });

    test('constructor', () => {
        // @ts-expect-error
        fooBind.withConstructor();

        const extendsFooBinding = extendsFooBind.withConstructor();
        expect(extendsFooBinding.scope).to.deep.equal(transientScope);
        expect(extendsFooBinding.depIds).to.deep.equal([]);
        expectTypeOf(extendsFooBinding.depIds).toEqualTypeOf<readonly []>();
        expect(extendsFooBinding.provider()).to.be.an.instanceOf(ExtendsFoo);
        expectTypeOf(extendsFooBinding.provider()).toEqualTypeOf<ExtendsFoo>();

        // @ts-expect-error
        barBind.withConstructor();
        // @ts-expect-error
        extendsBarBind.withConstructor();
        // @ts-expect-error
        eggBind.withConstructor();
        // @ts-expect-error
        chickenBind.withConstructor();
        // @ts-expect-error
        thingBind.withConstructor();
        // @ts-expect-error
        promisishBind.withConstructor();
    });

    test('constructor provider', () => {

        // @ts-expect-error
        fooBind.withConstructorProvider();

        const extendsFooProvider = extendsFooBind.withConstructorProvider();
        extendsFooProvider.withDependencies([]);
        // @ts-expect-error
        extendsFooProvider.withDependencies([Bar]);

        // @ts-expect-error
        const barProvider = barBind.withConstructorProvider();

        extendsBarBind.withConstructorProvider();
        extendsBarBind.withProvider(() => new ExtendsBar(123));

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

    test('generator', () => {

        const fooBinding = fooBind.withGenerator(() => new ExtendsFoo());
        expectTypeOf(fooBinding).toEqualTypeOf<
            Binding<HaystackId<Foo, null, null, false, false, false, false>, [], false>
        >();
        // @ts-expect-error
        fooBind.withGenerator(() => new ExtendsBar());

        // @ts-expect-error
        extendsFooBind.withGenerator(() => null);

        barBind.withGenerator(() => null);
        extendsBarBind.withGenerator(() => undefined);

        // @ts-expect-error
        thingBind.withGenerator((val: Thing) => val);

        promisishBind.withGenerator(async () => 123 as const);
        promisishBind.withGenerator(() => 789);
    });

    test('async generator', () => {

        const fooBinding = fooBind.withAsyncGenerator(() => new ExtendsFoo());
        expectTypeOf(fooBinding).toEqualTypeOf<
            Binding<HaystackId<Foo, null, null, false, false, false, false>, [], true>
        >();
        // @ts-expect-error
        fooBind.withAsyncGenerator(async () => new ExtendsBar());

        // @ts-expect-error
        extendsFooBind.withAsyncGenerator(async () => null);

        barBind.withAsyncGenerator(async () => null);
        extendsBarBind.withAsyncGenerator(() => undefined);

        // @ts-expect-error
        thingBind.withAsyncGenerator(async (val: Thing) => val);

        // @ts-expect-error
        promisishBind.withAsyncGenerator(() => Promise.resolve(123));
    });

    test('provider', () => {

        const fooProvider = fooBind.withProvider(() => new ExtendsFoo());
        expectTypeOf(
            fooProvider.withDependencies([])
        ).toEqualTypeOf<
            Binding<HaystackId<Foo, null, null, false, false, false, false>, [], false>
        >();
        // @ts-expect-error
        fooProvider.withDependencies([Foo]);

        // @ts-expect-error
        extendsFooBind.withProvider(() => ({} as Foo));
        // @ts-expect-error
        extendsFooBind.withProvider(async () => new ExtendsFoo());

        barBind.withProvider((bar: Bar) => bar).withDependencies([ExtendsBar]);
        // @ts-expect-error
        barBind.withProvider((extendsBar: ExtendsBar) => extendsBar).withDependencies([Bar]);
        // @ts-expect-error
        barBind.withProvider((bar: Bar) => bar).withDependencies([identifier(ExtendsBar).nullable()]);
        // @ts-expect-error
        barBind.withProvider((bar: Bar) => bar).withDependencies([identifier(ExtendsBar).supplier()]);

        const bindingDependsOnNumberMaker = bind(identifier<number>()).withProvider(
            (makeNumber: () => number) => makeNumber()
        );
        bindingDependsOnNumberMaker.withDependencies([
            identifier<() => number>()
        ]);
        // @ts-expect-error
        bindingDependsOnNumberMaker.withDependencies([
            identifier<() => number>().supplier()
        ]);

        const extendsBarProvider = extendsBarBind.withProvider((val: string | null) => new ExtendsBar((val ?? 'abc').length));
        extendsBarProvider.withDependencies([identifier<string>()])
        expectTypeOf(
            extendsBarProvider.withDependencies([identifier<string>().nullable()])
        ).toEqualTypeOf<
            Binding<
                HaystackId<ExtendsBar, typeof ExtendsBar, null, false, true, false, false>, 
                [HaystackId<string, null, null, true, false, false, false>], 
                false
            >
        >();
        // @ts-expect-error
        extendsBarProvider.withDependencies([]);

        promisishBind.withProvider(() => 789).withDependencies([]);
    });

    test('async provider', () => {

        const fooProvider = fooBind.withAsyncProvider(() => new ExtendsFoo());
        expectTypeOf(
            fooProvider.withDependencies([])
        ).toEqualTypeOf<
            Binding<HaystackId<Foo, null, null, false, false, false, false>, [], true>
        >();
        // @ts-expect-error
        fooProvider.withDependencies([Foo]);

        // @ts-expect-error
        extendsFooBind.withAsyncProvider(async () => ({} as Foo));

        barBind.withAsyncProvider(async (bar: Bar) => bar).withDependencies([ExtendsBar]);
        // @ts-expect-error
        barBind.withAsyncProvider(async (extendsBar: ExtendsBar) => extendsBar).withDependencies([Bar]);
        // @ts-expect-error
        barBind.withAsyncProvider(async (bar: Bar) => bar).withDependencies([identifier(ExtendsBar).undefinable()]);
        // @ts-expect-error
        barBind.withAsyncProvider(async (bar: Bar) => bar).withDependencies([identifier(ExtendsBar).lateBinding()]);

        const bindingDependsOnStringProm = bind(identifier<string>()).withAsyncProvider(
            async (resolveString: Promise<string>) => await resolveString
        );
        bindingDependsOnStringProm.withDependencies([
            identifier<Promise<string>>()
        ]);
        // @ts-expect-error
        bindingDependsOnStringProm.withDependencies([
            identifier<Promise<string>>().lateBinding()
        ]);

        const extendsBarProvider = extendsBarBind.withAsyncProvider(async (val: string | undefined) => new ExtendsBar(val?.length ?? 0));
        extendsBarProvider.withDependencies([identifier<string>()]);
        expectTypeOf(
            extendsBarProvider.withDependencies([identifier<string>().undefinable()])
        ).toEqualTypeOf<
            Binding<
                HaystackId<ExtendsBar, typeof ExtendsBar, null, false, true, false, false>, 
                [HaystackId<string, null, null, false, true, false, false>], 
                true
            >
        >();
        // @ts-expect-error
        extendsBarProvider.withDependencies([]);

        // @ts-expect-error
        promisishBind.withAsyncProvider(async () => 123);
    });

    suite('dependencies', () => {

        const fooDependencies = fooBind.withDependencies([identifier<'ignored'>()]);
        const extendsFooDependencies = extendsFooBind.withDependencies([]);

        class OtherBar extends ExtendsBar {
            otherVal = 123;
        }
        const barDependencies = barBind.withDependencies([
            identifier<'a' | 'b'>().named('<name>').supplier(),
            identifier<'a' | 'b'>().named('<name>').supplier('async'),
        ]);
        const aOrBSupplier = (() => 'a') as Supplier<'a'>;
        const aOrBAsyncSupplier = (async () => 'b') as AsyncSupplier<'b'>;
        const extendsBarDependencies = extendsBarBind.withDependencies([
            OtherBar,
            identifier<[number, number]>().nullable().lateBinding(), 
            identifier<number>().undefinable().supplier(), 
            identifier<boolean>().supplier('async')
        ]);

        const eggDependencies = eggBind.withDependencies([identifier(Egg).lateBinding()]);
        const chickenDependencies = chickenBind.withDependencies([Egg]);

        const thingDependencies = thingBind.withDependencies([identifier<string[]>()]);

        const promisishDependencies = promisishBind.withDependencies([]);

        test('constructor provider', () => {
            const extendsFooBinding = extendsFooDependencies.withConstructorProvider();
            expect(extendsFooBinding.provider()).to.be.an.instanceOf(ExtendsFoo);

            // @ts-expect-error
            fooDependencies.withConstructorProvider();
            // @ts-expect-error
            barDependencies.withConstructorProvider();


            // @ts-expect-error
            extendsBarDependencies.withConstructorProvider();
            extendsBarBind.withDependencies([identifier<number>()]).withConstructorProvider();
            extendsBarBind.withDependencies([identifier<number>(), identifier<'ignore'>()]).withConstructorProvider();

            eggDependencies.withConstructorProvider();
            chickenDependencies.withConstructorProvider();
            // @ts-expect-error
            chickenBind.withDependencies([]).withConstructorProvider();

            // @ts-expect-error
            thingDependencies.withConstructorProvider();

            // @ts-expect-error
            promisishDependencies.withConstructorProvider();
        });

        test('provider', () => {

            const fooBinding = fooDependencies.withProvider(() => new ExtendsFoo())
            expectTypeOf(
                fooDependencies.withProvider(ignored => {
                    expectTypeOf(ignored).toEqualTypeOf<'ignored'>();
                    return {} as ExtendsFoo;
                })
            ).toEqualTypeOf(fooBinding);
            expect(fooBinding.provider('ignored')).to.be.an.instanceOf(Foo);
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
            expectTypeOf(barBinding.provider(aOrBSupplier, aOrBAsyncSupplier)).toEqualTypeOf<Bar | null>();
            // @ts-expect-error
            barBinding.provider(aOrBAsyncSupplier, aOrBSupplier);
            // @ts-expect-error
            barBinding.provider('c');

            extendsBarDependencies.withProvider((otherBar, lateNullable, undefinedSupplier, asyncSupplier) => {
                expectTypeOf(lateNullable).toEqualTypeOf<LateBinding<[number, number] | null>>();
                expectTypeOf(undefinedSupplier).toEqualTypeOf<Supplier<number | undefined>>();
                expectTypeOf(asyncSupplier).toEqualTypeOf<AsyncSupplier<boolean>>();
                return otherBar;
            });

            eggDependencies.withProvider(lateEgg => new Egg(lateEgg));
            chickenDependencies.withProvider(egg => new Chicken(egg));

            thingDependencies.withProvider(stuff => ({ other: true, stuff: () => stuff }));
            thingDependencies.withProvider(
                // @ts-expect-error
                (wrong: number) => ({ wrong, stuff: () => [] })
            );

            promisishDependencies.withProvider(() => Promise.resolve(123));
        });

        test('async provider', async () => {

            expectTypeOf(
                fooDependencies.withAsyncProvider(() => ({} as ExtendsFoo))
            ).toEqualTypeOf(
                fooDependencies.withAsyncProvider(async ignored => {
                    expectTypeOf(ignored).toEqualTypeOf<'ignored'>();
                    return ({} as Foo);
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
            expect((await barBinding.provider(aOrBSupplier, aOrBAsyncSupplier))!.val).to.equal('123');

            eggDependencies.withAsyncProvider(lateEgg => new Egg(lateEgg));
            chickenDependencies.withAsyncProvider(async () => new Chicken({} as Egg));

            thingDependencies.withAsyncProvider(async stuff => ({ other: true, stuff: () => stuff }));
            thingDependencies.withAsyncProvider(
                // @ts-expect-error
                async (wrong: number) => ({ wrong, stuff: () => [] })
            );

            // @ts-expect-error
            promisishDependencies.withAsyncProvider(() => Promise.resolve(123));
        });
    });
});

suite('binding', () => {

    const binding = bind(identifier<1 | '2' | true>())
        .withDependencies([identifier<boolean>()])
        .withProvider(which => which ? 1 : '2');

    type BindingImplementation<Name extends string | symbol | null, Nullable extends boolean, Undefinable extends boolean, Async extends boolean> = Binding<
        HaystackId<true | 1 | "2", null, Name, Nullable, Undefinable, false, false>, 
        [HaystackId<boolean, null, null, false, false, false, false>], 
        Async
    >;

    expectTypeOf(binding).toEqualTypeOf<BindingImplementation<null, false, false, false>>();

    const namedBinding = binding.named('name');
    expect(namedBinding).to.not.equal(binding);

    expectTypeOf(namedBinding).toEqualTypeOf<BindingImplementation<'name', false, false, false>>();

    expectTypeOf(namedBinding.named()).toEqualTypeOf(binding);
    expectTypeOf(namedBinding.named()).toEqualTypeOf(namedBinding.named(null));

    const uniqueSym = Symbol('abc');
    // @ts-expect-error
    binding.named(Math.random() < 0.5 ? 'a' as const : 'b' as const);
    // @ts-expect-error
    binding.named(Math.random() < 0.5 ? 'a' as const : uniqueSym);
    // @ts-expect-error
    binding.named(Symbol.for('abc'));

    const nullableBinding = binding.nullable();
    expectTypeOf(nullableBinding).toEqualTypeOf<BindingImplementation<null, true, false, false>>();
    expectTypeOf(nullableBinding).toEqualTypeOf(binding.nullable(true));
    expect(nullableBinding).to.not.equal(binding);
    // @ts-expect-error
    binding.nullable(false);

    const undefinableBinding = binding.undefinable();
    expectTypeOf(undefinableBinding).toEqualTypeOf<BindingImplementation<null, false, true, false>>();
    expectTypeOf(undefinableBinding).toEqualTypeOf(binding.undefinable(true));
    expect(undefinableBinding).to.not.equal(binding);
    // @ts-expect-error
    binding.undefinable(false);

    expectTypeOf(
        binding.named('other-name')
            .nullable()
            .undefinable()
    ).toEqualTypeOf<BindingImplementation<'other-name', true, true, false>>();
    expect(
        binding.named('other-name')
            .nullable()
            .undefinable()
            .outputId
    ).to.equal(
        binding.outputId
            .named('other-name')
            .nullable()
            .undefinable()
    );
    expectTypeOf(
        binding.named('other-name')
            .nullable()
            .undefinable()
            .outputId
    ).toEqualTypeOf(
        binding.outputId
            .named('other-name')
            .nullable()
            .undefinable()
    );

    expectTypeOf(
        binding.named(uniqueSym)
            .nullable()
            .undefinable()
    ).toEqualTypeOf<BindingImplementation<typeof uniqueSym, true, true, false>>();
    expect(
        binding.named(uniqueSym)
            .nullable()
            .undefinable()
            .outputId
    ).to.equal(
        binding.outputId
            .named(uniqueSym)
            .nullable()
            .undefinable()
    );
    expectTypeOf(
        binding.named(uniqueSym)
            .nullable()
            .undefinable()
            .outputId
    ).toEqualTypeOf(
        binding.outputId
            .named(uniqueSym)
            .nullable()
            .undefinable()
    );

    expect(binding.scope).to.equal(transientScope);
    expect(binding.scoped(requestScope).scope).to.equal(requestScope);
    expect(binding.scoped(requestScope)).to.not.equal(binding);
    expectTypeOf(binding.scoped(requestScope)).toEqualTypeOf(binding);

    test('dependencyIds', () => {

        expect(binding.dependencyIds).to.equal(binding.depIds);
        expectTypeOf(binding.dependencyIds).toEqualTypeOf<readonly GenericHaystackId[]>();
    });
});