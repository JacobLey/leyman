import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as EnumToArray from 'enum-to-array';
import { suite, test } from 'mocha-chain';

/* eslint-disable no-restricted-syntax */
// This test suite implements multiple enum anti-patterns
// to ensure it works as intended, hence eslint-disable abuse.

suite('enumToArray', () => {
    test('Default values', () => {
        enum Default {
            /* eslint-disable @typescript-eslint/prefer-enum-initializers */
            A,
            B,
            C,
            D,
            /* eslint-enable @typescript-eslint/prefer-enum-initializers */
        }

        expectTypeOf(EnumToArray.enumToArray(Default)).toEqualTypeOf<
            (
                | {
                      key: 'A';
                      value: Default.A;
                  }
                | {
                      key: 'B';
                      value: Default.B;
                  }
                | {
                      key: 'C';
                      value: Default.C;
                  }
                | {
                      key: 'D';
                      value: Default.D;
                  }
            )[]
        >();
        expect(EnumToArray.enumToArray(Default)).to.deep.equal([
            { key: 'A', value: Default.A },
            { key: 'B', value: Default.B },
            { key: 'C', value: Default.C },
            { key: 'D', value: Default.D },
        ]);

        expectTypeOf(EnumToArray.enumToValues(Default)).toEqualTypeOf<
            (Default.A | Default.B | Default.C | Default.D)[]
        >();
        expect(EnumToArray.enumToValues(Default)).to.deep.equal([
            Default.A,
            Default.B,
            Default.C,
            Default.D,
        ]);

        expectTypeOf(EnumToArray.enumToKeys(Default)).toEqualTypeOf<(keyof typeof Default)[]>();
        expectTypeOf(EnumToArray.enumToKeys(Default)).toEqualTypeOf<('A' | 'B' | 'C' | 'D')[]>();
        expect(EnumToArray.enumToKeys(Default)).to.deep.equal(['A', 'B', 'C', 'D']);
    });

    test('String literals', () => {
        enum Opposite {
            FOO = 'BAR',
            ABC = 'XYZ',
            YES = 'NO',
            ONE = 'ZERO',
        }

        expectTypeOf(EnumToArray.enumToArray(Opposite)).toEqualTypeOf<
            (
                | {
                      key: 'ABC';
                      value: Opposite.ABC;
                  }
                | {
                      key: 'FOO';
                      value: Opposite.FOO;
                  }
                | {
                      key: 'ONE';
                      value: Opposite.ONE;
                  }
                | {
                      key: 'YES';
                      value: Opposite.YES;
                  }
            )[]
        >();
        expect(EnumToArray.enumToArray(Opposite)).to.deep.equal([
            { key: 'FOO', value: Opposite.FOO },
            { key: 'ABC', value: Opposite.ABC },
            { key: 'YES', value: Opposite.YES },
            { key: 'ONE', value: Opposite.ONE },
        ]);

        expectTypeOf(EnumToArray.enumToValues(Opposite)).toEqualTypeOf<
            (Opposite.ABC | Opposite.FOO | Opposite.ONE | Opposite.YES)[]
        >();
        expect(EnumToArray.enumToValues(Opposite)).to.deep.equal([
            Opposite.FOO,
            Opposite.ABC,
            Opposite.YES,
            Opposite.ONE,
        ]);

        expectTypeOf(EnumToArray.enumToKeys(Opposite)).toEqualTypeOf<(keyof typeof Opposite)[]>();
        expectTypeOf(EnumToArray.enumToKeys(Opposite)).toEqualTypeOf<
            ('ABC' | 'FOO' | 'ONE' | 'YES')[]
        >();
        expect(EnumToArray.enumToKeys(Opposite)).to.deep.equal(['FOO', 'ABC', 'YES', 'ONE']);
    });

    test('keys are values', () => {
        enum Colors {
            WHITE = 'WHITE',
            BLACK = 'BLACK',
            BLUE = 'BLUE',
        }

        expectTypeOf(EnumToArray.enumToArray(Colors)).toEqualTypeOf<
            (
                | {
                      key: 'BLACK';
                      value: Colors.BLACK;
                  }
                | {
                      key: 'BLUE';
                      value: Colors.BLUE;
                  }
                | {
                      key: 'WHITE';
                      value: Colors.WHITE;
                  }
            )[]
        >();
        expect(EnumToArray.enumToArray(Colors)).to.deep.equal([
            { key: 'WHITE', value: Colors.WHITE },
            { key: 'BLACK', value: Colors.BLACK },
            { key: 'BLUE', value: Colors.BLUE },
        ]);

        expectTypeOf(EnumToArray.enumToValues(Colors)).toEqualTypeOf<
            (Colors.BLACK | Colors.BLUE | Colors.WHITE)[]
        >();
        expect(EnumToArray.enumToValues(Colors)).to.deep.equal([
            Colors.WHITE,
            Colors.BLACK,
            Colors.BLUE,
        ]);

        expectTypeOf(EnumToArray.enumToKeys(Colors)).toEqualTypeOf<(keyof typeof Colors)[]>();
        expect(EnumToArray.enumToKeys(Colors)).to.deep.equal(['WHITE', 'BLACK', 'BLUE']);
    });

    test('Keys and values do not match', () => {
        enum Colors {
            WHITE = 'BLUE',
            BLACK = 'WHITE',
            BLUE = 'BLACK',
        }

        expectTypeOf(EnumToArray.enumToArray(Colors)).toEqualTypeOf<
            (
                | {
                      key: 'BLACK';
                      value: Colors.BLACK;
                  }
                | {
                      key: 'BLUE';
                      value: Colors.BLUE;
                  }
                | {
                      key: 'WHITE';
                      value: Colors.WHITE;
                  }
            )[]
        >();
        expect(EnumToArray.enumToArray(Colors)).to.deep.equal([
            { key: 'WHITE', value: Colors.WHITE },
            { key: 'BLACK', value: Colors.BLACK },
            { key: 'BLUE', value: Colors.BLUE },
        ]);

        expectTypeOf(EnumToArray.enumToValues(Colors)).toEqualTypeOf<
            (Colors.BLACK | Colors.BLUE | Colors.WHITE)[]
        >();

        expectTypeOf(EnumToArray.enumToKeys(Colors)).toEqualTypeOf<(keyof typeof Colors)[]>();
    });

    test('Duplicate values', () => {
        enum Duplicates {
            /* eslint-disable @typescript-eslint/no-duplicate-enum-values */
            ONE = 1,
            WON = 1,
            // eslint-disable-next-line @typescript-eslint/no-mixed-enums
            TOO = 'TOO',
            TWO = 'TOO',
            FOUR = 'FOR',
            FOR = 'FORD',
            // eslint-disable-next-line @typescript-eslint/prefer-literal-enum-member
            FORE = FOUR,
            /* eslint-enable @typescript-eslint/no-duplicate-enum-values */
        }

        expectTypeOf(EnumToArray.enumToArray(Duplicates)).toEqualTypeOf<
            (
                | {
                      key: 'FOR';
                      value: Duplicates.FOR;
                  }
                | {
                      key: 'FORE';
                      value: Duplicates.FORE;
                  }
                | {
                      key: 'FOUR';
                      value: Duplicates.FOUR;
                  }
                | {
                      key: 'ONE';
                      value: Duplicates.ONE;
                  }
                | {
                      key: 'TOO';
                      value: Duplicates.TOO;
                  }
                | {
                      key: 'TWO';
                      value: Duplicates.TWO;
                  }
                | {
                      key: 'WON';
                      value: Duplicates.WON;
                  }
            )[]
        >();
        expect(EnumToArray.enumToArray(Duplicates)).to.deep.equal([
            { key: 'ONE', value: Duplicates.ONE },
            { key: 'WON', value: Duplicates.WON },
            { key: 'TOO', value: Duplicates.TOO },
            { key: 'TWO', value: Duplicates.TWO },
            { key: 'FOUR', value: Duplicates.FOUR },
            { key: 'FOR', value: Duplicates.FOR },
            { key: 'FORE', value: Duplicates.FORE },
        ]);

        expectTypeOf(EnumToArray.enumToValues(Duplicates)).toEqualTypeOf<
            (Duplicates.FOR | Duplicates.FORE | Duplicates.ONE | Duplicates.TOO)[]
        >();
        expect(EnumToArray.enumToValues(Duplicates, { unique: true })).to.deep.equal([
            Duplicates.ONE,
            Duplicates.TOO,
            Duplicates.FOUR,
            Duplicates.FOR,
        ]);

        expectTypeOf(EnumToArray.enumToKeys(Duplicates)).toEqualTypeOf<
            (keyof typeof Duplicates)[]
        >();
        expectTypeOf(EnumToArray.enumToKeys(Duplicates)).toEqualTypeOf<
            ('FOR' | 'FORE' | 'FOUR' | 'ONE' | 'TOO' | 'TWO' | 'WON')[]
        >();
    });

    test('Computed values', () => {
        enum Computed {
            /* eslint-disable @typescript-eslint/prefer-literal-enum-member */
            FIVE = 5,
            DOUBLE = FIVE * 2,
            HALF = DOUBLE / 2,
            NAN = Number.NaN,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Infinity = Number.POSITIVE_INFINITY,
            /* eslint-enable @typescript-eslint/prefer-literal-enum-member */
        }

        expectTypeOf(EnumToArray.enumToArray(Computed)).toEqualTypeOf<
            (
                | {
                      key: 'DOUBLE';
                      value: typeof Computed.DOUBLE;
                  }
                | {
                      key: 'FIVE';
                      value: typeof Computed.FIVE;
                  }
                | {
                      key: 'HALF';
                      value: typeof Computed.HALF;
                  }
                | {
                      key: 'Infinity';
                      value: typeof Computed.Infinity;
                  }
                | {
                      key: 'NAN';
                      value: typeof Computed.NAN;
                  }
            )[]
        >();
        expect(EnumToArray.enumToArray(Computed)).to.deep.equal([
            { key: 'FIVE', value: Computed.FIVE },
            { key: 'DOUBLE', value: Computed.DOUBLE },
            { key: 'HALF', value: Computed.HALF },
            { key: 'NAN', value: Computed.NAN },
            { key: 'Infinity', value: Computed.Infinity },
        ]);

        expectTypeOf(EnumToArray.enumToValues(Computed)).toEqualTypeOf<
            (Computed.DOUBLE | Computed.FIVE | Computed.Infinity | Computed.NAN)[]
        >();
        expect(EnumToArray.enumToValues(Computed, { unique: true })).to.deep.equal([
            Computed.FIVE,
            Computed.DOUBLE,
            Computed.NAN,
            Computed.Infinity,
        ]);

        expectTypeOf(EnumToArray.enumToKeys(Computed)).toEqualTypeOf<(keyof typeof Computed)[]>();
    });

    test('Values are computed literals', () => {
        const set = new Set([1, 2, 3]);
        const reg = /abc/u;
        enum Literals {
            /* eslint-disable @typescript-eslint/prefer-literal-enum-member */
            // @ts-expect-error
            SET = set,
            // @ts-expect-error
            OBJ = {},
            // @ts-expect-error
            ARR = [],
            // @ts-expect-error
            NIL = null,
            // @ts-expect-error
            REG = reg,
            /* eslint-enable @typescript-eslint/prefer-literal-enum-member */
        }

        expectTypeOf(EnumToArray.enumToArray(Literals)).toEqualTypeOf<
            (
                | {
                      key: 'ARR';
                      value: typeof Literals.ARR;
                  }
                | {
                      key: 'NIL';
                      value: typeof Literals.NIL;
                  }
                | {
                      key: 'OBJ';
                      value: typeof Literals.OBJ;
                  }
                | {
                      key: 'REG';
                      value: typeof Literals.REG;
                  }
                | {
                      key: 'SET';
                      value: typeof Literals.SET;
                  }
            )[]
        >();
        expect(EnumToArray.enumToArray(Literals)).to.deep.equal([
            { key: 'SET', value: set },
            { key: 'OBJ', value: {} },
            { key: 'ARR', value: [] },
            { key: 'NIL', value: null },
            { key: 'REG', value: reg },
        ]);

        expectTypeOf(EnumToArray.enumToValues(Literals)).toEqualTypeOf<
            (Literals.ARR | Literals.NIL | Literals.OBJ | Literals.REG | Literals.SET)[]
        >();

        expectTypeOf(EnumToArray.enumToKeys(Literals)).toEqualTypeOf<(keyof typeof Literals)[]>();
    });

    test('Empty enum', () => {
        enum Empty {}

        expectTypeOf(EnumToArray.enumToArray(Empty)).toEqualTypeOf<[]>();
        expect(EnumToArray.enumToArray(Empty)).to.deep.equal([]);

        expectTypeOf(EnumToArray.enumToValues(Empty)).toEqualTypeOf<[]>();

        expectTypeOf(EnumToArray.enumToKeys(Empty)).toEqualTypeOf<[]>();
    });
});
