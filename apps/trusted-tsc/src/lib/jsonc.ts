/**
 * Find the end of a JSON string.
 *
 * @param text - JSON text
 * @param start - index of the string's opening quote
 * @returns index after its closing quote, or the text's length if it has none
 */
const stringEnd = (text: string, start: number): number => {
    let index = start + 1;
    while (index < text.length && text[index] !== '"') {
        index += text[index] === '\\' ? 2 : 1;
    }
    return index + 1;
};

/**
 * Parse JSON with comments and trailing commas, as TypeScript reads `tsconfig.json`.
 *
 * @param text - JSON text, with `//` and `/* *\/` comments and trailing commas allowed
 * @returns parsed value
 * @throws {SyntaxError} if it isn't JSON, once comments and trailing commas are removed
 */
export const parseJsonc = (text: string): unknown => {
    let json = '';
    let index = 0;
    while (index < text.length) {
        if (text[index] === '"') {
            const end = stringEnd(text, index);
            json += text.slice(index, end);
            index = end;
        } else if (text.startsWith('//', index)) {
            const end = text.indexOf('\n', index);
            index = end === -1 ? text.length : end;
        } else if (text.startsWith('/*', index)) {
            const end = text.indexOf('*/', index + 2);
            index = end === -1 ? text.length : end + 2;
        } else {
            const char = text[index]!;
            if (char === ']' || char === '}') {
                // Everything since the last token is whitespace, so a comma there is trailing
                json = json.replace(/,\s*$/v, '');
            }
            json += char;
            index++;
        }
    }
    return JSON.parse(json);
};
