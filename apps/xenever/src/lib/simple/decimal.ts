/**
 * The decimal lexical form ([XSD 1.1 Part 2 §3.3.3](https://www.w3.org/TR/xmlschema11-2/#decimal)): an
 * optional sign, then digits with at most one `.`, at least one digit.
 */
const decimalLexical = /^(?<sign>[+\-]?)(?<integer>\d*)(?:\.(?<fraction>\d*))?$/v;

/**
 * A decimal number, exactly.
 */
export interface Decimal {
    readonly negative: boolean;
    /**
     * Integer digits without leading zeros, `''` for none.
     */
    readonly integer: string;
    /**
     * Fraction digits without trailing zeros, `''` for none.
     */
    readonly fraction: string;
}

/**
 * Reads a decimal lexical form.
 *
 * @param lexical - text, whitespace already collapsed
 * @returns the number, or `null` when the text isn't a decimal
 */
export const readDecimal = (lexical: string): Decimal | null => {
    const groups = decimalLexical.exec(lexical)?.groups;
    if (groups === undefined) {
        return null;
    }
    const fractionText = groups.fraction ?? '';
    if (fractionText === '' && groups.integer === '') {
        return null;
    }
    const integer = groups.integer!.replace(/^0+/v, '');
    let end = fractionText.length;
    while (fractionText[end - 1] === '0') {
        end--;
    }
    const fraction = fractionText.slice(0, end);
    // Zero has no sign: `-0` is `0`.
    return {
        negative: groups.sign === '-' && (integer !== '' || fraction !== ''),
        integer,
        fraction,
    };
};

/**
 * Canonical form of a decimal ([XSD 1.1 Part 2 §3.3.3.2](https://www.w3.org/TR/xmlschema11-2/#f-decimalCanmap)):
 * no `+`, no leading or trailing zeros, and no `.` for an integer (`3`, `-0.5`, `0`).
 *
 * @param decimal - number to write
 * @returns its canonical form
 */
export const canonicalDecimal = ({ negative, integer, fraction }: Decimal): string => {
    const sign = negative ? '-' : '';
    const point = fraction === '' ? '' : '.';
    return `${sign}${integer || '0'}${point}${fraction}`;
};

/**
 * Compares two decimals.
 *
 * @param a - one number
 * @param b - another
 * @returns negative when `a < b`, 0 when equal, positive when `a > b`
 */
export const compareDecimals = (a: Decimal, b: Decimal): number => {
    const scale = Math.max(a.fraction.length, b.fraction.length);
    // Both as integers in units of the smaller fraction digit.
    const scaled = ({ negative, integer, fraction }: Decimal): bigint => {
        const magnitude = BigInt(`${integer}${fraction.padEnd(scale, '0')}` || '0');
        return negative ? -magnitude : magnitude;
    };
    const difference = scaled(a) - scaled(b);
    return Number(difference > 0n) - Number(difference < 0n);
};

/**
 * Digits a decimal needs, as `totalDigits` counts them
 * ([XSD 1.1 Part 2 §4.3.11](https://www.w3.org/TR/xmlschema11-2/#rf-totalDigits)): the value must be
 * `i / 10^n` with `|i| < 10^totalDigits` and `n <= totalDigits`, so `0.0012` needs 4.
 *
 * @param decimal - the number
 * @returns its total digits
 */
export const totalDigits = ({ integer, fraction }: Decimal): number =>
    // With no integer digits, `n` (the fraction's length) is the larger bound; otherwise every digit counts.
    integer.length + fraction.length;
