import type { TsType } from './ts-type.js';
import { stringType } from './ts-type.js';

/**
 * Characters with a special meaning in a regular expression, which must be escaped to be matched literally.
 */
const specialCharacters = new Set(String.raw`\^$.*+?()[]{}|/`);

/**
 * Hex escapes that `escape-string-regexp` (used by Juniper) writes for characters that are special
 * in some contexts, such as `-` within a character class.
 */
const hexEscape = /^x(?<code>[0-9a-f]{2})/iv;

/**
 * Read a regular expression made only of literal characters, e.g. `abc\.def`.
 *
 * @param source - regular expression source, without anchors
 * @returns the literal text it matches, or `null` if it matches anything other than one literal string
 */
const parseLiteral = (source: string): string | null => {
    let text = '';
    for (let i = 0; i < source.length; i++) {
        const char = source[i]!;
        if (char === '\\') {
            const next = source.charAt(i + 1);
            const hex = hexEscape.exec(source.slice(i + 1));
            if (hex) {
                text += String.fromCodePoint(Number.parseInt(hex.groups!.code!, 16));
                i += hex[0].length;
            } else if (specialCharacters.has(next)) {
                text += next;
                i++;
            } else {
                // Classes such as `\d`, `\w` or `\b`
                return null;
            }
        } else if (specialCharacters.has(char)) {
            return null;
        } else {
            text += char;
        }
    }
    return text;
};

/**
 * Type of a string matching a `pattern`.
 *
 * Juniper writes `startsWith`, `endsWith` and `contains` as patterns, such as `^abc`.
 * Patterns of that form (an anchored or unanchored literal) are read back into the same template literal
 * types, e.g. `` `abc${string}` ``. Any other pattern is just a `string`.
 *
 * @param pattern - regular expression
 * @returns type of strings it matches
 */
export const patternType = (pattern: string): TsType => {
    const isStart = pattern.startsWith('^');
    // An escaped `\$` is a literal dollar sign, not an anchor
    const isEnd = pattern.endsWith('$') && !pattern.endsWith(String.raw`\$`);
    const text = parseLiteral(
        pattern.slice(isStart ? 1 : 0, isEnd ? pattern.length - 1 : pattern.length)
    );
    if (text === null || text === '') {
        return stringType;
    }
    if (isStart && isEnd) {
        return { kind: 'literal', value: text };
    }
    return {
        kind: 'template',
        parts: [
            ...(isStart ? [] : [{ kind: 'string' } as const]),
            { kind: 'text', text },
            ...(isEnd ? [] : [{ kind: 'string' } as const]),
        ],
    };
};
