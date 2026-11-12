import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { XeneverInvalidSchemaError, XeneverUnsupportedError } from 'xenever';
import { compilePattern } from '#internal/lib/simple/regex.js';

/**
 * Asserts which strings a pattern matches.
 *
 * @param pattern - XSD regular expression
 * @param matches - strings it matches
 * @param misses - strings it doesn't
 */
const expectMatches = (
    pattern: string,
    matches: readonly string[],
    misses: readonly string[] = []
): void => {
    const regExp = compilePattern(pattern, '/p');
    for (const text of matches) {
        expect(regExp.test(text), `${pattern} matches ${JSON.stringify(text)}`).to.equal(true);
    }
    for (const text of misses) {
        expect(regExp.test(text), `${pattern} misses ${JSON.stringify(text)}`).to.equal(false);
    }
};

/**
 * Asserts a pattern is invalid.
 *
 * @param pattern - XSD regular expression
 * @param reason - matches the message
 */
const expectInvalid = (pattern: string, reason: RegExp): void => {
    expect(() => compilePattern(pattern, '/p'))
        .to.throw(XeneverInvalidSchemaError, reason)
        .that.includes({ path: '/p' });
};

suite('compilePattern', () => {
    test('Matches the whole string', () => {
        expectMatches('ab|c', ['ab', 'c'], ['abc', 'a', 'xc']);
    });

    test('Matches the empty pattern only against the empty string', () => {
        expectMatches('', [''], ['a']);
    });

    test('Reads ^ and $ as literals', () => {
        expectMatches('^a$', ['^a$'], ['a']);
    });

    test('Supports groups and quantifiers', () => {
        expectMatches('(ab)+c?d*e{2}f{1,2}g{2,}', ['abeefgg', 'ababcddeeffggg'], ['abef', 'eef']);
        expectMatches('a{0}', [''], ['a']);
    });

    test('Matches . against anything but a line break', () => {
        expectMatches('.', ['a', '\u{2028}', '😀'], ['\n', '\r']);
    });

    test('Reads escapes', () => {
        expectMatches(String.raw`\n\r\t\\\|\.\-\^\?\*\+\{\}\(\)\[\]`, ['\n\r\t\\|.-^?*+{}()[]']);
    });

    test('Reads multi-character escapes as XSD defines them', () => {
        expectMatches(String.raw`\s`, [' ', '\t', '\n', '\r'], ['\u{A0}', 'a']);
        expectMatches(String.raw`\S`, ['a'], [' ']);
        expectMatches(String.raw`\d`, ['1', '٣'], ['a']);
        expectMatches(String.raw`\D`, ['a'], ['1']);
        expectMatches(String.raw`\w`, ['a', 'é', '1'], ['.', ' ', '\u{0}']);
        expectMatches(String.raw`\W`, ['.'], ['a']);
        expectMatches(String.raw`\i\c*`, ['_a-1', ':b'], ['-a', '1']);
        expectMatches(String.raw`\I`, ['-'], ['a']);
        expectMatches(String.raw`\C`, [' '], ['-']);
    });

    test('Reads category escapes', () => {
        expectMatches(String.raw`\p{Lu}\P{Lu}`, ['Ab'], ['AB', 'ab']);
    });

    test('Supports character classes', () => {
        expectMatches('[a-c_]', ['a', 'b', '_'], ['d']);
        expectMatches('[^a-c]', ['d'], ['a']);
        expectMatches('[-a]', ['-', 'a'], ['b']);
        expectMatches('[a-]', ['-', 'a'], ['b']);
        expectMatches(String.raw`[\d\s\-]`, ['1', ' ', '-'], ['a']);
        expectMatches(String.raw`[\p{Lu}]`, ['A'], ['a']);
        expectMatches('[+--]', ['+', ',', '-'], ['a']);
        expectMatches('[$^]', ['$', '^'], ['a']);
    });

    test('Supports class subtraction', () => {
        expectMatches('[a-z-[aeiou]]', ['b'], ['a']);
        expectMatches('[^a-z-[0-9]]', ['A'], ['a', '1']);
        expectMatches('[a-z-[b-y-[c]]]', ['a', 'c', 'z'], ['b']);
        expectMatches('[a-z--[b-z]]', ['a', '-'], ['b', 'z']);
    });

    test('Caches compiled patterns', () => {
        expect(compilePattern('cached', '/p')).to.equal(compilePattern('cached', '/q'));
    });

    test('Rejects invalid patterns', () => {
        expectInvalid('(a', /ends early at character 3/v);
        expectInvalid('a)', /has an unmatched `\)`/v);
        expectInvalid('*', /has an unescaped `\*`/v);
        expectInvalid('a**', /has an unescaped `\*`/v);
        expectInvalid(']', /has an unescaped `\]`/v);
        expectInvalid('a{', /expects a number in a quantifier/v);
        expectInvalid('a{,2}', /expects a number in a quantifier/v);
        expectInvalid('a{2,1}', /maximum is below its minimum/v);
        expectInvalid('a{1x}', /expects `\}`/v);
        expectInvalid(String.raw`\b`, /unknown escape `\\b`/v);
        expectInvalid(String.raw`[\b]`, /unknown escape `\\b` in a character class/v);
        expectInvalid(String.raw`\p{Foo}`, /unknown category `Foo`/v);
        expectInvalid(String.raw`\p{L`, /ends early/v);
        expectInvalid(String.raw`\pL`, /expects `\{`/v);
        expectInvalid('[]', /empty character class/v);
        expectInvalid('[a', /ends early/v);
        expectInvalid('[a[b]', /unescaped `\[` in a character class/v);
        expectInvalid('[a-c-e]', /`-` that is neither a range nor at either end/v);
        expectInvalid('[a--b]', /`-` that is neither a range nor at either end/v);
        expectInvalid(String.raw`[a-\d]`, /range ending in a multi-character escape/v);
        expectInvalid('[z-a]', /range whose end is before its start/v);
        expectInvalid('\\', /ends early/v);
    });

    test('Rejects block escapes as unsupported', () => {
        expect(() => compilePattern(String.raw`\p{IsBasicLatin}`, '/p'))
            .to.throw(XeneverUnsupportedError, /block escape `\\p\{IsBasicLatin\}`/v)
            .that.includes({ path: '/p' });
    });
});
