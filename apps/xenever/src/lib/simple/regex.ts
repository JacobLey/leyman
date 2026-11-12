import { XeneverInvalidSchemaError, XeneverUnsupportedError } from '#internal/lib/errors.js';
import { escapeCodePoint, nameChars, nameStartChars } from './names.js';

/**
 * Unicode general categories an XSD regular expression may name with `\p{...}`
 * ([XSD 1.1 Part 2 §G.4.2.4](https://www.w3.org/TR/xmlschema11-2/#cces-cat)). JavaScript knows each by the
 * same name.
 */
const categories: ReadonlySet<string> = new Set([
    'C',
    'Cc',
    'Cf',
    'Cn',
    'Co',
    'L',
    'Ll',
    'Lm',
    'Lo',
    'Lt',
    'Lu',
    'M',
    'Mc',
    'Me',
    'Mn',
    'N',
    'Nd',
    'Nl',
    'No',
    'P',
    'Pc',
    'Pd',
    'Pe',
    'Pf',
    'Pi',
    'Po',
    'Ps',
    'S',
    'Sc',
    'Sk',
    'Sm',
    'So',
    'Z',
    'Zl',
    'Zp',
    'Zs',
]);

/**
 * Characters a single-character escape may escape (`SingleCharEsc`), and the character each stands for.
 */
const singleCharEscapes: ReadonlyMap<string, string> = new Map([
    ...Array.from(String.raw`\|.-^?*+{}()[]`, char => [char, char] as const),
    ['n', '\n'],
    ['r', '\r'],
    ['t', '\t'],
]);

/**
 * Multi-character escapes (`MultiCharEsc`), as `v`-flag classes. Unlike JavaScript's, XSD's `\d` and `\w` are
 * Unicode-wide, and `\s` is only XML's four whitespace characters.
 */
const multiCharEscapes: ReadonlyMap<string, string> = new Map([
    ['s', String.raw`[\u{20}\u{9}\u{A}\u{D}]`],
    ['S', String.raw`[^\u{20}\u{9}\u{A}\u{D}]`],
    ['i', `[${nameStartChars}]`],
    ['I', `[^${nameStartChars}]`],
    ['c', `[${nameChars}]`],
    ['C', `[^${nameChars}]`],
    ['d', String.raw`\p{Nd}`],
    ['D', String.raw`\P{Nd}`],
    ['w', String.raw`[^\p{P}\p{Z}\p{C}]`],
    ['W', String.raw`[\p{P}\p{Z}\p{C}]`],
]);

/**
 * Characters that are syntax outside a character class, so not a literal (`NormalChar` excludes them).
 */
const metaCharacters: ReadonlySet<string> = new Set('.\\?*+{}()|[]');

/**
 * A character as a `v`-flag pattern literal, valid inside a class or out: letters and digits as they are,
 * everything else as a code point escape, so no character is read as syntax.
 *
 * @param char - one code point
 * @returns the pattern literal
 */
const literal = (char: string): string =>
    /^[\dA-Za-z]$/v.test(char) ? char : escapeCodePoint(char);

/**
 * Translates one XSD regular expression ([XSD 1.1 Part 2 §G](https://www.w3.org/TR/xmlschema11-2/#regexs))
 * into a `v`-flag JavaScript pattern, reading it one code point at a time.
 */
class Translator {
    readonly #chars: readonly string[];
    readonly #pattern: string;
    readonly #path: string;
    #index = 0;

    /**
     * @param pattern - XSD regular expression
     * @param path - path to the facet, for errors
     */
    public constructor(pattern: string, path: string) {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread -- XSD regular expressions read code points, as spreading does
        this.#chars = [...pattern];
        this.#pattern = pattern;
        this.#path = path;
    }

    /**
     * Translates the whole expression.
     *
     * @returns the JavaScript pattern, anchored at both ends: an XSD pattern always matches the whole value
     */
    public translate(): string {
        const source = this.#regExp();
        if (this.#index < this.#chars.length) {
            // `#regExp` stops only at the end or at an unmatched `)`.
            this.#fail('has an unmatched `)`');
        }
        return `^(?:${source})$`;
    }

    /**
     * Throws an invalid schema error about the pattern.
     *
     * @param reason - what is wrong
     * @throws {XeneverInvalidSchemaError} always
     */
    #fail(reason: string): never {
        throw new XeneverInvalidSchemaError(
            `Pattern ${JSON.stringify(this.#pattern)} ${reason} at character ${this.#index + 1}`,
            { path: this.#path }
        );
    }

    #peek(offset = 0): string | undefined {
        return this.#chars[this.#index + offset];
    }

    #next(): string {
        const char = this.#chars[this.#index];
        if (char === undefined) {
            this.#fail('ends early');
        }
        this.#index++;
        return char;
    }

    #expect(char: string): void {
        if (this.#next() === char) {
            return;
        }

        this.#index--;
        this.#fail(`expects \`${char}\``);
    }

    /**
     * `regExp ::= branch ( '|' branch )*`
     *
     * @returns the translated alternatives
     */
    #regExp(): string {
        const branches = [this.#branch()];
        while (this.#peek() === '|') {
            this.#index++;
            branches.push(this.#branch());
        }
        return branches.join('|');
    }

    /**
     * `branch ::= piece*`
     *
     * @returns the translated pieces
     */
    #branch(): string {
        let source = '';
        for (
            let char = this.#peek();
            char !== undefined && char !== '|' && char !== ')';
            char = this.#peek()
        ) {
            source += this.#piece();
        }
        return source;
    }

    /**
     * `piece ::= atom quantifier?`
     *
     * @returns the translated piece
     */
    #piece(): string {
        const atom = this.#atom();
        const char = this.#peek();
        if (char === '?' || char === '*' || char === '+') {
            this.#index++;
            return atom + char;
        }
        if (char === '{') {
            this.#index++;
            return atom + this.#quantity();
        }
        return atom;
    }

    /**
     * `quantity ::= QuantExact | QuantExact ',' QuantExact?`, after the `{`.
     *
     * @returns the translated quantifier
     */
    #quantity(): string {
        const digits = (): string => {
            let value = '';
            while (/^\d$/v.test(this.#peek() ?? '')) {
                value += this.#next();
            }
            return value;
        };
        const min = digits();
        if (min === '') {
            this.#fail('expects a number in a quantifier');
        }
        let max: string | null = min;
        if (this.#peek() === ',') {
            this.#index++;
            max = digits() || null;
        }
        this.#expect('}');
        if (max !== null && BigInt(max) < BigInt(min)) {
            this.#fail('has a quantifier whose maximum is below its minimum');
        }
        return max === min ? `{${min}}` : `{${min},${max ?? ''}}`;
    }

    /**
     * `atom ::= NormalChar | charClass | ( '(' regExp ')' )`
     *
     * @returns the translated atom
     */
    #atom(): string {
        const char = this.#next();
        switch (char) {
            case '(': {
                const inner = this.#regExp();
                this.#expect(')');
                return `(?:${inner})`;
            }
            case '[': {
                return this.#charClassExpression();
            }
            case '\\': {
                return this.#escapeSequence(false).source;
            }
            case '.': {
                // Any character but a line break: unlike JavaScript's `.`, U+2028 and U+2029 match.
                return String.raw`[^\u{A}\u{D}]`;
            }
            default: {
                if (metaCharacters.has(char)) {
                    this.#index--;
                    this.#fail(`has an unescaped \`${char}\``);
                }
                // `^` and `$` are literals: XSD patterns have no anchors.
                return literal(char);
            }
        }
    }

    /**
     * An escape, after the `\`: a single character, a multi-character escape, or a category.
     *
     * @param isInClass - whether inside a character class (`\-` stands for `-` either way)
     * @returns the translation, and the character when it stands for exactly one
     * @throws {XeneverInvalidSchemaError} when the escape is unknown
     * @throws {XeneverUnsupportedError} when it is a block escape
     */
    #escapeSequence(isInClass: boolean): { readonly source: string; readonly char: string | null } {
        const char = this.#next();
        const single = singleCharEscapes.get(char);
        if (single !== undefined) {
            return { source: literal(single), char: single };
        }
        const multi = multiCharEscapes.get(char);
        if (multi !== undefined) {
            return { source: multi, char: null };
        }
        if (char === 'p' || char === 'P') {
            return { source: this.#category(char), char: null };
        }
        this.#index--;
        return this.#fail(
            `has an unknown escape \`\\${char}\`${isInClass ? ' in a character class' : ''}`
        );
    }

    /**
     * A category escape, after `\p` or `\P`.
     *
     * @param letter - `p`, or `P` for the complement
     * @returns the translated escape
     * @throws {XeneverInvalidSchemaError} when the category is unknown
     * @throws {XeneverUnsupportedError} when it is a block escape
     */
    #category(letter: 'P' | 'p'): string {
        this.#expect('{');
        let categoryName = '';
        while (this.#peek() !== '}') {
            categoryName += this.#next();
        }
        this.#index++;
        if (categoryName.startsWith('Is')) {
            // JavaScript has no Unicode block property to translate a block escape to.
            throw new XeneverUnsupportedError(
                `Pattern ${JSON.stringify(this.#pattern)} uses the block escape \`\\${letter}{${categoryName}}\`, which xenever doesn't support`,
                { path: this.#path }
            );
        }
        if (!categories.has(categoryName)) {
            this.#fail(`has an unknown category \`${categoryName}\``);
        }
        return `\\${letter}{${categoryName}}`;
    }

    /**
     * `charClassExpr ::= '[' charGroup ']'`, after the `[`. A subtraction (`[a-z-[aeiou]]`) translates to the
     * `v` flag's `--`.
     *
     * @returns the translated class
     */
    #charClassExpression(): string {
        const isNegated = this.#peek() === '^';
        if (isNegated) {
            this.#index++;
        }
        const parts: string[] = [];
        let subtracted: string | null = null;
        while (subtracted === null && this.#peek() !== ']') {
            if (this.#peek() === '-' && this.#peek(1) === '[' && parts.length > 0) {
                this.#index += 2;
                subtracted = this.#charClassExpression();
            } else {
                parts.push(this.#charGroupPart(parts.length === 0));
            }
        }
        if (parts.length === 0) {
            this.#fail('has an empty character class');
        }
        this.#expect(']');
        const group = `[${isNegated ? '^' : ''}${parts.join('')}]`;
        return subtracted === null ? group : `[${group}--${subtracted}]`;
    }

    /**
     * One part of a character group: a character, a range or an escape.
     *
     * @param isFirst - whether it is the group's first part, where `-` is a literal
     * @returns the translated part
     */
    #charGroupPart(isFirst: boolean): string {
        const start = this.#singleChar(isFirst);
        if (
            start.char === null ||
            this.#peek() !== '-' ||
            this.#peek(1) === ']' ||
            this.#peek(1) === '['
        ) {
            return start.source;
        }
        this.#index++;
        const end = this.#singleChar(false);
        if (end.char === null) {
            this.#fail('has a range ending in a multi-character escape');
        }
        if (end.char.codePointAt(0)! < start.char.codePointAt(0)!) {
            this.#fail('has a range whose end is before its start');
        }
        return `${start.source}-${end.source}`;
    }

    /**
     * A character in a group, or an escape there.
     *
     * @param isFirst - whether it starts the group, where `-` is a literal
     * @returns the translation, and the character when it stands for exactly one
     */
    #singleChar(isFirst: boolean): { readonly source: string; readonly char: string | null } {
        const char = this.#next();
        if (char === '\\') {
            return this.#escapeSequence(true);
        }
        if (char === '[') {
            this.#index--;
            this.#fail('has an unescaped `[` in a character class');
        }
        if (char === '-' && !isFirst && this.#peek() !== ']') {
            this.#index--;
            this.#fail('has a `-` that is neither a range nor at either end of a character class');
        }
        return { source: literal(char), char };
    }
}

/**
 * Compiled patterns, by XSD regular expression: patterns are compiled at first use, once.
 */
const compiled = new Map<string, RegExp>();

/**
 * Compiles an XSD regular expression ([XSD 1.1 Part 2 §G](https://www.w3.org/TR/xmlschema11-2/#regexs)) to a
 * JavaScript `RegExp` with the `v` flag that matches exactly the strings it does, as a whole.
 *
 * @param pattern - XSD regular expression
 * @param path - path to the facet, for errors
 * @returns the compiled pattern
 * @throws {XeneverInvalidSchemaError} when the pattern isn't a valid XSD regular expression
 * @throws {XeneverUnsupportedError} when it uses a block escape (`\p{IsBasicLatin}`)
 */
export const compilePattern = (pattern: string, path: string): RegExp => {
    let regExp = compiled.get(pattern);
    if (!regExp) {
        // Every construct is translated to valid `v`-flag syntax, so this doesn't throw.
        const translator = new Translator(pattern, path);
        regExp = new RegExp(translator.translate(), 'v');
        compiled.set(pattern, regExp);
    }
    return regExp;
};
