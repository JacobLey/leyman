import type { DateKind } from '#internal/lib/schema/ir.js';

/**
 * Ordering date, time and duration values, for their range and enumeration facets. XSD orders them partially:
 * two values may be neither smaller, equal nor larger than each other, which a comparison returns as `NaN`,
 * failing every range facet and matching no enumeration value.
 */

/**
 * A number of seconds, exactly: `units` / 10^`scale`, as seconds may have any number of fraction digits.
 */
interface Exact {
    readonly units: bigint;
    readonly scale: number;
}

const ten = 10n;

/**
 * Seconds as an exact number.
 *
 * @param whole - whole seconds
 * @param fraction - digits after the point, `''` for none
 * @returns the number
 */
const exact = (whole: bigint, fraction = ''): Exact => ({
    units: whole * ten ** BigInt(fraction.length) + BigInt(fraction === '' ? 0 : fraction),
    scale: fraction.length,
});

/**
 * Two exact numbers at one scale.
 *
 * @param a - one number
 * @param b - another
 * @returns their units at the larger of their scales
 */
const align = (a: Exact, b: Exact): readonly [bigint, bigint, number] => {
    const scale = Math.max(a.scale, b.scale);
    return [
        a.units * ten ** BigInt(scale - a.scale),
        b.units * ten ** BigInt(scale - b.scale),
        scale,
    ];
};

/**
 * Adds two exact numbers.
 *
 * @param a - one number
 * @param b - another
 * @returns their sum
 */
const add = (a: Exact, b: Exact): Exact => {
    const [unitsA, unitsB, scale] = align(a, b);
    return { units: unitsA + unitsB, scale };
};

/**
 * Negates an exact number.
 *
 * @param value - a number
 * @returns its negation
 */
const negate = (value: Exact): Exact => ({ units: -value.units, scale: value.scale });

/**
 * Compares two exact numbers.
 *
 * @param a - one number
 * @param b - another
 * @returns -1, 0 or 1 as `a` is smaller, equal or larger
 */
const compareExact = (a: Exact, b: Exact): number => {
    const [unitsA, unitsB] = align(a, b);
    if (unitsA === unitsB) {
        return 0;
    }
    return unitsA < unitsB ? -1 : 1;
};

/**
 * Integer division rounding down, as the date arithmetic of XSD does for negative years.
 *
 * @param a - dividend
 * @param b - positive divisor
 * @returns the floor of `a / b`
 */
const floorDiv = (a: bigint, b: bigint): bigint => {
    const quotient = a / b;
    return a % b < 0n ? quotient - 1n : quotient;
};

const monthsInYear = 12n;
const december = 12;
const secondsPerDay = 86_400n;
const secondsPerHour = 3600n;
const secondsPerMinute = 60n;
const hoursPerDay = 24n;
const minutesPerHour = 60;

/* eslint-disable @typescript-eslint/no-magic-numbers -- the constants of the published algorithm */
/**
 * Days from 1970-01-01 to a date of the proleptic Gregorian calendar, year 0 included
 * ([days_from_civil](https://howardhinnant.github.io/date_algorithms.html#days_from_civil)).
 *
 * @param year - astronomical year: 0 is 1 BCE
 * @param month - 1 to 12
 * @param day - day of the month, from 1
 * @returns the days, negative before 1970
 */
const daysFromCivil = (year: bigint, month: number, day: number): bigint => {
    const shifted = month <= 2 ? year - 1n : year;
    const era = floorDiv(shifted, 400n);
    const yearOfEra = shifted - era * 400n;
    // Months from March, so the leap day ends the year.
    const monthFromMarch = BigInt((month + 9) % 12);
    const dayOfYear = (153n * monthFromMarch + 2n) / 5n + BigInt(day) - 1n;
    const dayOfEra = yearOfEra * 365n + yearOfEra / 4n - yearOfEra / 100n + dayOfYear;
    return era * 146_097n + dayOfEra - 719_468n;
};
/* eslint-enable @typescript-eslint/no-magic-numbers */

/**
 * Days in a month ([XSD 1.1 Part 2 §D.3.2](https://www.w3.org/TR/xmlschema11-2/#f-daysInMonth)).
 *
 * @param year - astronomical year: 0 is 1 BCE
 * @param month - 1 to 12
 * @returns the number of days
 */
const daysInMonth = (year: bigint, month: number): number => {
    const next =
        month === december ? daysFromCivil(year + 1n, 1, 1) : daysFromCivil(year, month + 1, 1);
    return Number(next - daysFromCivil(year, month, 1));
};

/**
 * A date or time value: seconds on a timeline, ignoring its timezone, and the timezone, in minutes east of UTC.
 */
export interface DateValue {
    readonly local: Exact;
    readonly timezone: number | null;
}

/**
 * Length of a timezone written as an offset: `±hh:mm`.
 */
const offsetLength = 6;

/**
 * Splits the timezone off a valid lexical form.
 *
 * @param lexical - a valid lexical form of a date or time type
 * @returns the form without its timezone, and the timezone in minutes east of UTC, `null` for none
 */
const splitTimezone = (lexical: string): readonly [string, number | null] => {
    if (lexical.endsWith('Z')) {
        return [lexical.slice(0, -1), 0];
    }
    const offset = lexical.slice(-offsetLength);
    // Only an offset has a colon after a sign: a time's colons follow digits.
    if (!/^[+\-]\d{2}:\d{2}$/v.test(offset)) {
        return [lexical, null];
    }
    const [hours, minutes] = offset.slice(1).split(':', 2);
    const total = Number(hours) * minutesPerHour + Number(minutes);
    return [lexical.slice(0, -offsetLength), offset.startsWith('-') ? -total : total];
};

/**
 * Fields of a date or time value; those its type lacks are absent.
 */
interface DateFields {
    readonly year?: string;
    readonly month?: string;
    readonly day?: string;
    readonly time?: string;
}

/**
 * Digits of a month, day, hour, minute or whole second.
 */
const fieldDigits = 2;
/**
 * Width of such a field with the separator before it.
 */
const fieldWidth = 3;

/**
 * A field of a date written as its last fields are: a separator and two digits each.
 *
 * @param text - a date's lexical form without its timezone
 * @param fromEnd - fields after it
 * @returns the field's digits
 */
const fieldFromEnd = (text: string, fromEnd: number): string => {
    const end = text.length - fieldWidth * fromEnd;
    return text.slice(end - fieldDigits, end);
};

/**
 * The year of a date, before its last fields. A year may be negative and longer than four digits, so dates
 * are split from the end.
 *
 * @param text - a date's lexical form without its timezone
 * @param fields - fields after the year
 * @returns its digits, with any sign
 */
const yearBefore = (text: string, fields: number): string =>
    text.slice(0, text.length - fieldWidth * fields);

/**
 * Reads the fields of each date and time type's valid lexical form, without its timezone.
 */
const fieldReaders: Readonly<Record<Exclude<DateKind, 'duration'>, (text: string) => DateFields>> =
    {
        dateTime: text => {
            const [date, time] = text.split('T', 2) as [string, string];
            return { ...fieldReaders.date(date), time };
        },
        date: text => ({
            year: yearBefore(text, 2),
            month: fieldFromEnd(text, 1),
            day: fieldFromEnd(text, 0),
        }),
        time: text => ({ time: text }),
        gYearMonth: text => ({ year: yearBefore(text, 1), month: fieldFromEnd(text, 0) }),
        gYear: text => ({ year: text }),
        gMonthDay: text => ({ month: fieldFromEnd(text, 1), day: fieldFromEnd(text, 0) }),
        gMonth: text => ({ month: fieldFromEnd(text, 0) }),
        gDay: text => ({ day: fieldFromEnd(text, 0) }),
    };

/**
 * Hours, minutes and seconds of a time.
 */
const timeFields = 3;

/**
 * Year a date or time value without one takes for ordering.
 */
const defaultYear = 1972n;

/**
 * Reads a date or time value. Fields its type lacks take the values XSD gives them for ordering
 * ([XSD 1.1 Part 2 §D.2.1](https://www.w3.org/TR/xmlschema11-2/#vp-dt-timeOnTimeline)): year 1972, December,
 * and the last day of the month; `24:00:00` is midnight at the end of the day, which for `time` is `00:00:00`.
 *
 * @param kind - a date or time type
 * @param lexical - a valid lexical form, whitespace collapsed
 * @returns its value
 */
export const readDateValue = (kind: Exclude<DateKind, 'duration'>, lexical: string): DateValue => {
    const [text, timezone] = splitTimezone(lexical);
    const fields = fieldReaders[kind](text);
    const year = fields.year === undefined ? defaultYear : BigInt(fields.year);
    const month = fields.month === undefined ? december : Number(fields.month);
    const day = fields.day === undefined ? daysInMonth(year, month) : Number(fields.day);
    const [hour = '0', minute = '0', secondText = '0'] = fields.time?.split(':', timeFields) ?? [];
    const [second = '0', fraction] = secondText.split('.', 2);
    const hours = kind === 'time' && hour === '24' ? 0n : BigInt(hour);
    const seconds =
        daysFromCivil(year, month, day) * secondsPerDay +
        hours * secondsPerHour +
        BigInt(minute) * secondsPerMinute +
        BigInt(second);
    return { timezone, local: exact(seconds, fraction) };
};

/**
 * Seconds in the 14 hours a timezone may be away from UTC.
 */
const maxTimezoneHours = 14n;
const timezoneRange = exact(maxTimezoneHours * secondsPerHour);

/**
 * Seconds of a value on the UTC timeline.
 *
 * @param value - a value with a timezone
 * @returns its seconds
 */
const utc = (value: DateValue): Exact =>
    add(value.local, exact(-BigInt(value.timezone!) * secondsPerMinute));

/**
 * Compares a value with a timezone to one without, which is any time within 14 hours of its local time.
 *
 * @param zoned - a value with a timezone
 * @param local - a value without
 * @returns -1 or 1 as `zoned` is before or after every time `local` may be; `NaN` otherwise
 */
const compareToLocal = (zoned: DateValue, local: DateValue): number => {
    const at = utc(zoned);
    if (compareExact(at, add(local.local, negate(timezoneRange))) < 0) {
        return -1;
    }
    return compareExact(at, add(local.local, timezoneRange)) > 0 ? 1 : Number.NaN;
};

/**
 * Compares two date or time values of one type
 * ([XSD 1.0 Part 2 §3.2.7.4](https://www.w3.org/TR/xmlschema-2/#dateTime-order)): on the timeline when both or
 * neither have a timezone; otherwise the one without is any time within 14 hours of its local time, so the
 * order is indeterminate when the other falls within that range, bounds included.
 *
 * @param a - one value
 * @param b - another
 * @returns -1, 0 or 1 as `a` is smaller, equal or larger; `NaN` when indeterminate
 */
export const compareDateValues = (a: DateValue, b: DateValue): number => {
    if ((a.timezone === null) === (b.timezone === null)) {
        return a.timezone === null ? compareExact(a.local, b.local) : compareExact(utc(a), utc(b));
    }
    return a.timezone === null ? -compareToLocal(b, a) : compareToLocal(a, b);
};

/**
 * A duration value: months and seconds, each with the duration's sign.
 */
export interface DurationValue {
    readonly months: bigint;
    readonly seconds: Exact;
}

/**
 * Adds a field of a duration's lexical form to its value.
 *
 * @param total - value of the fields before it
 * @param designator - the letter after its number
 * @param isTime - whether it is after the `T`
 * @param digits - its number, with a fraction only for seconds
 * @returns the value with it added
 */
const addDurationField = (
    total: DurationValue,
    designator: string,
    isTime: boolean,
    digits: string
): DurationValue => {
    const [whole = '', fraction] = digits.split('.', 2);
    const value = BigInt(whole);
    const addSeconds = (seconds: Exact): DurationValue => ({
        months: total.months,
        seconds: add(total.seconds, seconds),
    });
    switch (designator) {
        case 'Y': {
            return { months: total.months + value * monthsInYear, seconds: total.seconds };
        }
        case 'M': {
            return isTime
                ? addSeconds(exact(value * secondsPerMinute))
                : { months: total.months + value, seconds: total.seconds };
        }
        case 'D': {
            return addSeconds(exact(value * hoursPerDay * secondsPerHour));
        }
        case 'H': {
            return addSeconds(exact(value * secondsPerHour));
        }
        default: {
            return addSeconds(exact(value, fraction));
        }
    }
};

/**
 * Reads a duration value.
 *
 * @param lexical - a valid lexical form, whitespace collapsed
 * @returns its value
 */
export const readDurationValue = (lexical: string): DurationValue => {
    let value: DurationValue = { months: 0n, seconds: exact(0n) };
    let isTime = false;
    let digits = '';
    // A valid form is a sign, `P`, then numbers each followed by its designator, with `T` before the time.
    for (const character of lexical) {
        if (character === 'T') {
            isTime = true;
        } else if (/[\d.]/v.test(character)) {
            digits += character;
        } else if (digits !== '') {
            value = addDurationField(value, character, isTime, digits);
            digits = '';
        }
    }
    return lexical.startsWith('-')
        ? { months: -value.months, seconds: negate(value.seconds) }
        : value;
};

/* eslint-disable @typescript-eslint/no-magic-numbers -- the dateTimes the spec names */
/**
 * The dateTimes durations are compared from ([XSD 1.0 Part 2 §3.2.6.2](https://www.w3.org/TR/xmlschema-2/#duration-order)),
 * as year and month, each on the first of the month at midnight UTC: together they cover months of every length
 * and both kinds of February.
 */
const durationOrigins: readonly (readonly [year: bigint, month: number])[] = [
    [1696n, 9],
    [1697n, 2],
    [1903n, 3],
    [1903n, 7],
];
/* eslint-enable @typescript-eslint/no-magic-numbers */

/**
 * Seconds on the timeline of a duration added to the first of a month
 * ([XSD 1.0 Part 2 Appendix E](https://www.w3.org/TR/xmlschema-2/#adding-durations-to-dateTimes)): its months
 * move the month, then its seconds move along the timeline, as the day of the month never needs clamping.
 *
 * @param origin - year and month to start from
 * @param duration - what to add
 * @returns the seconds of the result
 */
const addToOrigin = (
    [year, month]: readonly [year: bigint, month: number],
    duration: DurationValue
): Exact => {
    const months = year * monthsInYear + BigInt(month - 1) + duration.months;
    const resultYear = floorDiv(months, monthsInYear);
    const resultMonth = Number(months - resultYear * monthsInYear) + 1;
    return add(exact(daysFromCivil(resultYear, resultMonth, 1) * secondsPerDay), duration.seconds);
};

/**
 * Compares two durations: equal, smaller or larger when added to every one of four dateTimes, and otherwise
 * indeterminate, as `P1M` and `P30D` are.
 *
 * @param a - one duration
 * @param b - another
 * @returns -1, 0 or 1 as `a` is smaller, equal or larger; `NaN` when indeterminate
 */
export const compareDurationValues = (a: DurationValue, b: DurationValue): number => {
    const comparisons = new Set(
        durationOrigins.map(origin => compareExact(addToOrigin(origin, a), addToOrigin(origin, b)))
    );
    return comparisons.size === 1 ? comparisons.values().next().value! : Number.NaN;
};

/**
 * An exact number written so that equal numbers are written alike: trailing zeros of the fraction dropped.
 *
 * @param value - a number
 * @returns its canonical text
 */
const canonicalExact = ({ units, scale }: Exact): string => {
    let reduced = units;
    let reducedScale = scale;
    while (reducedScale > 0 && reduced % ten === 0n) {
        reduced /= ten;
        reducedScale--;
    }
    return `${reduced}e-${reducedScale}`;
};

/**
 * Identifies a date or time value in its value space: two values of one type get the same text exactly when they
 * are equal ([XSD 1.0 Part 2 §3.2.7.4](https://www.w3.org/TR/xmlschema-2/#dateTime-order)). Values with a
 * timezone are equal on the UTC timeline; a value without one is only ever equal to another without one, as
 * any comparison with a value with a timezone is indeterminate or unequal.
 *
 * @param kind - a date or time type
 * @param lexical - a valid lexical form, whitespace collapsed
 * @returns the identifying text
 */
export const dateIdentity = (kind: Exclude<DateKind, 'duration'>, lexical: string): string => {
    const value = readDateValue(kind, lexical);
    return value.timezone === null
        ? `local ${canonicalExact(value.local)}`
        : `utc ${canonicalExact(utc(value))}`;
};

/**
 * Identifies a duration in its value space: two durations are equal exactly when their months and their seconds
 * are, as XSD 1.1 defines it ([Part 2 §3.3.6.2](https://www.w3.org/TR/xmlschema11-2/#duration)). XSD 1.0's four
 * reference dateTimes agree but for durations of centuries, where months and days can come out even: `P400Y`
 * and `P146097D` are equal there.
 *
 * @param lexical - a valid lexical form, whitespace collapsed
 * @returns the identifying text
 */
export const durationIdentity = (lexical: string): string => {
    const { months, seconds } = readDurationValue(lexical);
    return `${months} ${canonicalExact(seconds)}`;
};
