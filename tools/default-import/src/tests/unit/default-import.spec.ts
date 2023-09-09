import * as Chai from 'chai';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-hookup';
import * as DefaultImport from 'default-import';
import cjs from '../data/cjs.cjs';
import esm from '../data/esm.js';
import namedCjs from '../data/named-cjs.cjs';
import * as noDefault from '../data/no-default.js';
import rootCjs from '../data/root-cjs.cjs';

const [
    dynamicCjs,
    dynamicEsm,
    dynamicNamedCjs,
    dynamicNoDefault,
    dynamicRootCjs,
] = await Promise.all([
    import('../data/cjs.cjs'),
    import('../data/esm.js'),
    import('../data/named-cjs.cjs'),
    import('../data/no-default.js'),
    import('../data/root-cjs.cjs'),
]);

suite('defaultImport', () => {

    suite('Returns default', () => {

        test('ESM export', () => {
            expect(DefaultImport.defaultImport(esm)).to.eq(esm);
            expect(DefaultImport.defaultImport(esm)).to.eq(DefaultImport.defaultImport(dynamicEsm));
            expectTypeOf(DefaultImport.defaultImport(esm)).toEqualTypeOf<{ esm: boolean }>();

            expect(
                DefaultImport.defaultImport(DefaultImport.defaultImport(esm))
            ).to.eq(DefaultImport.defaultImport(esm));
            expectTypeOf(
                DefaultImport.defaultImport(DefaultImport.defaultImport(esm))
            ).toEqualTypeOf<{ esm: boolean }>();

            expect(DefaultImport.defaultImport(esm)).to.deep.equal({ esm: true });
        });

        test('Only default export', async () => {

            expect(DefaultImport.defaultImport(Chai)).to.eq(Chai);
            expectTypeOf(DefaultImport.defaultImport(Chai)).toEqualTypeOf<typeof Chai>();

            expect(DefaultImport.defaultImport(cjs)).to.equal(cjs.default);
            expectTypeOf(DefaultImport.defaultImport(cjs)).toEqualTypeOf<{ cjs: boolean }>();

            expect(DefaultImport.defaultImport(cjs)).to.eq(DefaultImport.defaultImport(dynamicCjs));
            expect(DefaultImport.defaultImport(cjs)).to.eq(DefaultImport.defaultImport(dynamicCjs.default));

            expectTypeOf(DefaultImport.defaultImport(dynamicCjs)).toEqualTypeOf<{ cjs: boolean }>();
            expectTypeOf(DefaultImport.defaultImport(dynamicCjs.default)).toEqualTypeOf<{ cjs: boolean }>();

            expect(
                DefaultImport.defaultImport(DefaultImport.defaultImport(cjs))
            ).to.eq(DefaultImport.defaultImport(cjs));
            expectTypeOf(
                DefaultImport.defaultImport(DefaultImport.defaultImport(cjs))
            ).toEqualTypeOf<{ cjs: boolean }>();

            expect(DefaultImport.defaultImport(cjs)).to.deep.equal({ cjs: true });
        });
    });

    suite('Returns raw', () => {

        test('Export is single object', () => {
            expect(DefaultImport.defaultImport(rootCjs)).to.equal(rootCjs);
            expectTypeOf(DefaultImport.defaultImport(rootCjs)).toEqualTypeOf<{ rootCjs: boolean }>();

            expect(DefaultImport.defaultImport(rootCjs)).to.eq(DefaultImport.defaultImport(dynamicRootCjs));
            expectTypeOf(DefaultImport.defaultImport(dynamicRootCjs)).toEqualTypeOf<{ rootCjs: boolean }>();
            expectTypeOf(DefaultImport.defaultImport(dynamicRootCjs.default)).toEqualTypeOf<{ rootCjs: boolean }>();

            expect(
                DefaultImport.defaultImport(DefaultImport.defaultImport(rootCjs))
            ).to.eq(DefaultImport.defaultImport(rootCjs));
            expectTypeOf(
                DefaultImport.defaultImport(DefaultImport.defaultImport(rootCjs))
            ).toEqualTypeOf<{ rootCjs: boolean }>();

            expect(DefaultImport.defaultImport(rootCjs)).to.deep.equal({ rootCjs: true });
        });

        test('No default is found', () => {
            expect(DefaultImport.defaultImport(noDefault)).to.equal(noDefault);
            expectTypeOf(DefaultImport.defaultImport(noDefault)).toEqualTypeOf<{ readonly noDefault: true }>();

            expect(
                DefaultImport.defaultImport(noDefault)
            ).to.eq(DefaultImport.defaultImport(dynamicNoDefault));
            expectTypeOf(DefaultImport.defaultImport(dynamicNoDefault)).toEqualTypeOf<{ readonly noDefault: true }>();

            expect(
                DefaultImport.defaultImport(DefaultImport.defaultImport(noDefault))
            ).to.eq(DefaultImport.defaultImport(noDefault));
            expectTypeOf(
                DefaultImport.defaultImport(DefaultImport.defaultImport(noDefault))
            ).toEqualTypeOf<{ readonly noDefault: true }>();

            expect(DefaultImport.defaultImport(noDefault)).to.deep.equal(
                Object.create(null, {
                    noDefault: {
                        value: true,
                        enumerable: true,
                    },
                    [Symbol.toStringTag]: {
                        value: 'Module',
                        enumerable: false,
                    },
                })
            );

            expect(DefaultImport.defaultImport(namedCjs)).to.equal(namedCjs);
            expectTypeOf(DefaultImport.defaultImport(namedCjs)).toEqualTypeOf<{ readonly named: '<named>' }>();

            expect(
                DefaultImport.defaultImport(namedCjs)
            ).to.eq(DefaultImport.defaultImport(dynamicNamedCjs));
            expectTypeOf(DefaultImport.defaultImport(dynamicNamedCjs)).toEqualTypeOf<{ readonly named: '<named>' }>();

            expect(
                DefaultImport.defaultImport(DefaultImport.defaultImport(namedCjs))
            ).to.eq(DefaultImport.defaultImport(namedCjs));
            expectTypeOf(
                DefaultImport.defaultImport(DefaultImport.defaultImport(namedCjs))
            ).toEqualTypeOf<{ readonly named: '<named>' }>();

            expect(DefaultImport.defaultImport(namedCjs)).to.deep.equal({ named: '<named>' });
        });
    });

    test('Handles literals', () => {
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        expect(DefaultImport.defaultImport(undefined)).to.equal(undefined);
        expectTypeOf(DefaultImport.defaultImport(undefined)).toEqualTypeOf(undefined);

        expect(DefaultImport.defaultImport(null)).to.equal(null);
        expectTypeOf(DefaultImport.defaultImport(null)).toEqualTypeOf(null);

        expect(DefaultImport.defaultImport(0)).to.equal(0);
        expectTypeOf(DefaultImport.defaultImport(0)).toEqualTypeOf(0);

        expect(DefaultImport.defaultImport(123)).to.equal(123);
        expectTypeOf(DefaultImport.defaultImport(123 as const)).toEqualTypeOf(123 as const);

        expect(DefaultImport.defaultImport(0n)).to.equal(0n);
        expectTypeOf(DefaultImport.defaultImport(0n)).toEqualTypeOf(0n);

        expect(DefaultImport.defaultImport(123n)).to.equal(123n);
        expectTypeOf(DefaultImport.defaultImport(123n as const)).toEqualTypeOf(123n as const);

        expect(DefaultImport.defaultImport('<abc>')).to.equal('<abc>');
        expectTypeOf(DefaultImport.defaultImport('<abc>')).toEqualTypeOf('<abc>');

        expect(DefaultImport.defaultImport(true)).to.equal(true);
        expectTypeOf(DefaultImport.defaultImport(true)).toEqualTypeOf<boolean>();

        expect(DefaultImport.defaultImport(false)).to.equal(false);
        expectTypeOf(DefaultImport.defaultImport(false as const)).toEqualTypeOf(false);

        expect(DefaultImport.defaultImport([])).to.deep.equal([]);
        expectTypeOf(DefaultImport.defaultImport([] as const)).toEqualTypeOf([] as const);

        expect(DefaultImport.defaultImport({})).to.deep.equal({});
        expectTypeOf(DefaultImport.defaultImport({})).toEqualTypeOf({});
    });
});
