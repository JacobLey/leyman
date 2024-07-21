import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha';
import {
    type AsyncSupplier,
    type HaystackId,
    type HaystackIdType,
    identifier,
    type LateBinding,
    type Supplier,
} from 'haywire';
import { expect } from '../chai-hooks.js';

suite('Generate identifier', () => {
    test('From type parameter', () => {
        interface Foo {
            foo: () => boolean;
            bar: number;
        }

        const id = identifier<Foo>();
        expectTypeOf(id).toEqualTypeOf<HaystackId<Foo, null, null, false, false, false, false>>();
        expect(id.id).to.equal('haystack-id');
        expect(id.construct).to.equal(null);

        const aliasedId = identifier<string>('<custom-name>');
        expect(aliasedId.id).to.equal('<custom-name>');
        expect(id.construct).to.equal(null);

        // @ts-expect-error
        identifier<Foo | null>();
        // @ts-expect-error
        identifier<Foo | undefined>();
        // @ts-expect-error
        identifier<Supplier<Foo>>();
        // @ts-expect-error
        identifier<AsyncSupplier<Foo>>();
        // @ts-expect-error
        identifier<LateBinding<Foo>>(); // eslint-disable-line @typescript-eslint/no-floating-promises
        // @ts-expect-error
        identifier<unknown>();
        // @ts-expect-error
        identifier<any>();
        // @ts-expect-error
        identifier<never>();
        // @ts-expect-error
        identifier();
    });

    test('From class', () => {
        class Foo {
            public readonly val: string;
            public constructor(val: string) {
                this.val = val;
            }
        }
        class Bar extends Foo {
            public constructor(val: string) {
                super(val);
            }
        }
        class PrivateBar extends Foo {
            private constructor(val: string) {
                super(val);
            }
        }
        class EmptyBar extends Foo {
            public constructor() {
                super('foo');
            }
        }
        class ExtraBar extends Foo {
            public constructor(val: string, val2: string) {
                super(val + val2);
            }
        }

        const fooId = identifier(Foo);
        expectTypeOf(fooId).toEqualTypeOf<
            HaystackId<Foo, typeof Foo, null, false, false, false, false>
        >();
        expect(fooId.id).to.equal('Foo');
        expect(fooId.construct).to.equal(Foo);

        expect(identifier(Foo)).to.equal(fooId);

        identifier<typeof Foo>(Bar);
        identifier<typeof Foo>(EmptyBar);

        const privateBarId = identifier(PrivateBar);
        // @ts-expect-error
        identifier<typeof Foo>(PrivateBar);
        expect(privateBarId.construct).to.equal(PrivateBar);
        expectTypeOf(privateBarId).toEqualTypeOf<
            HaystackId<PrivateBar, null, null, false, false, false, false>
        >();

        identifier(ExtraBar);
        // @ts-expect-error
        identifier<typeof Foo>(ExtraBar);

        const unknownConstructor: new () => unknown = {} as new () => unknown;
        // @ts-expect-error
        identifier(unknownConstructor);
    });

    test('From existing id', () => {
        const id = identifier<string>();

        const dupe = identifier(id);
        expectTypeOf(id).toEqualTypeOf(dupe);

        expect(dupe).to.equal(id);
    });
});

suite('annotations', () => {
    interface Foo {
        foo: 123;
    }

    const id = identifier<Foo>();

    test('named', () => {
        const named = id.named('<named>');
        expectTypeOf(named.annotations.named).toEqualTypeOf('<named>' as const);
        expect(named.annotations.named).to.equal('<named>');

        expectTypeOf(id.annotations.named).toEqualTypeOf(null);
        expect(id.annotations.named).to.equal(null);

        expect(id.named('<named>')).to.equal(named);
        expect(named.named('<named>')).to.equal(named);
        expect(id).to.not.equal(named);

        const sym = Symbol('abc');
        const symbolNamed = id.named(sym);

        expectTypeOf(symbolNamed.annotations.named).toEqualTypeOf(sym);
        expect(symbolNamed.annotations.named).to.equal(sym);

        expect(id.named(sym)).to.equal(symbolNamed);
        expect(id.named(Symbol.metadata)).to.not.equal(symbolNamed);
        expect(symbolNamed.named(sym)).to.equal(symbolNamed);
        expect(id).to.not.equal(symbolNamed);
        expect(symbolNamed.named()).to.equal(id);

        expect(named.named('<new-name>')).to.equal(id.named('<new-name>'));

        const removed = named.named();
        expectTypeOf(removed).toEqualTypeOf(id);
        expect(removed).to.equal(id);

        // @ts-expect-error
        id.named<'a' | 'b'>('a');
        // @ts-expect-error
        id.named(Symbol('abc'));
        // @ts-expect-error
        id.named(Symbol.for('abc'));
        // @ts-expect-error
        id.named(Math.random() ? sym : ('a' as const));
        // @ts-expect-error
        id.named(Math.random() ? sym : Symbol.metadata);
        // @ts-expect-error
        id.named<string>('a');
        // @ts-expect-error
        id.named<symbol>(sym);
    });

    test('nullable', () => {
        const nullable = id.nullable();
        expectTypeOf<HaystackIdType<typeof nullable>>().toEqualTypeOf<Foo | null>();

        expectTypeOf(nullable.annotations.nullable).toEqualTypeOf(true);
        expect(nullable.annotations.nullable).to.equal(true);

        expectTypeOf(id.annotations.nullable).toEqualTypeOf(false);
        expect(id.annotations.nullable).to.equal(false);

        expect(id.nullable(true)).to.equal(nullable);
        expect(id).to.not.equal(nullable);

        const removed = nullable.nullable(false);
        expectTypeOf(removed).toEqualTypeOf(id);
        expect(removed).to.equal(id);

        // @ts-expect-error
        id.nullable(Math.random() < 0.5);
    });

    test('undefinable', () => {
        const undefinable = id.undefinable();
        expectTypeOf<HaystackIdType<typeof undefinable>>().toEqualTypeOf<Foo | undefined>();

        expectTypeOf(undefinable.annotations.undefinable).toEqualTypeOf(true);
        expect(undefinable.annotations.undefinable).to.equal(true);

        expectTypeOf(id.annotations.undefinable).toEqualTypeOf(false);
        expect(id.annotations.undefinable).to.equal(false);

        expect(id.undefinable(true)).to.equal(undefinable);
        expect(id).to.not.equal(undefinable);

        const removed = undefinable.undefinable(false);
        expectTypeOf(removed).toEqualTypeOf(id);
        expect(removed).to.equal(id);

        // @ts-expect-error
        id.undefinable(Math.random() < 0.5);
    });

    test('supplier', () => {
        const supplier = id.supplier();
        expectTypeOf<HaystackIdType<typeof supplier>>().toEqualTypeOf<Supplier<Foo>>();

        expectTypeOf(supplier.annotations.supplier).toEqualTypeOf<{
            sync: true;
            propagateScope: boolean;
        }>();
        expect(supplier.annotations.supplier).to.deep.equal({
            sync: true,
            propagateScope: false,
        });

        const asyncSupplier = id.supplier('async');
        expectTypeOf<HaystackIdType<typeof asyncSupplier>>().toEqualTypeOf<AsyncSupplier<Foo>>();

        expectTypeOf(asyncSupplier.annotations.supplier).toEqualTypeOf<{
            sync: false;
            propagateScope: boolean;
        }>();
        expect(asyncSupplier.annotations.supplier).to.deep.equal({
            sync: false,
            propagateScope: false,
        });

        expectTypeOf(id.annotations.supplier).toEqualTypeOf(false);
        expect(id.annotations.supplier).to.equal(false);

        expect(id.supplier(true)).to.equal(supplier);
        expect(id.supplier('async')).to.equal(asyncSupplier);
        expect(id).to.not.equal(supplier);

        const removed = supplier.supplier(false);
        expectTypeOf(removed).toEqualTypeOf(id);
        expect(removed).to.equal(id);
        expect(asyncSupplier.supplier(false)).to.equal(id);

        // @ts-expect-error
        id.supplier(Math.random() < 0.5);
        // @ts-expect-error
        id.supplier('text');
    });

    test('lateBinding', () => {
        const lateBinding = id.lateBinding();
        expectTypeOf<HaystackIdType<typeof lateBinding>>().toEqualTypeOf<LateBinding<Foo>>();

        expectTypeOf(lateBinding.annotations.lateBinding).toEqualTypeOf(true);
        expect(lateBinding.annotations.lateBinding).to.equal(true);

        expectTypeOf(id.annotations.lateBinding).toEqualTypeOf(false);
        expect(id.annotations.lateBinding).to.equal(false);

        expect(id.lateBinding(true)).to.equal(lateBinding);
        expect(id).to.not.equal(lateBinding);

        const removed = lateBinding.lateBinding(false);
        expectTypeOf(removed).toEqualTypeOf(id);
        expect(removed).to.equal(id);

        // @ts-expect-error
        id.lateBinding(Math.random() < 0.5);
    });

    test('baseId', () => {
        expect(id.baseId()).to.equal(id);
        expectTypeOf(id.baseId()).toEqualTypeOf(id);

        const namedId = id.named('<name>');
        expect(namedId.baseId()).to.equal(id.named('<name>'));
        expectTypeOf(namedId.baseId()).toEqualTypeOf(namedId);

        const allId = id.nullable().undefinable().supplier().lateBinding();
        expect(allId.baseId()).to.equal(id);
        expectTypeOf(allId.baseId()).toEqualTypeOf(id);
    });

    test('all', () => {
        const all = id.named('<name>').nullable().undefinable().supplier().lateBinding();
        const allOrder = id.lateBinding().supplier().undefinable().nullable().named('<name>');
        expectTypeOf(allOrder).toEqualTypeOf(all);
        expect(allOrder).to.equal(all);

        expectTypeOf<HaystackIdType<typeof all>>().toEqualTypeOf<
            LateBinding<Supplier<Foo | null | undefined>>
        >();

        expect(
            all.named().nullable(false).undefinable(false).supplier(false).lateBinding(false)
        ).to.equal(id);
    });
});
