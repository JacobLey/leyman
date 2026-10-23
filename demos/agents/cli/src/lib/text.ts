/**
 * Text from the API, made safe to print to a terminal: control characters (an escape sequence that recolours or
 * rewrites the terminal, a carriage return that hides what came before) are printed escaped, as JSON would, e.g.
 * `\u001b`. Notes are users' text, and whoever reads the output (a person, or an agent) should see what's there.
 *
 * @param text - From the API
 * @param keep - Control characters to leave as they are, e.g. a body's newlines and tabs
 * @returns It, printable
 */
export const printable = (text: string, keep: readonly string[] = []): string =>
    text.replaceAll(/\p{Cc}/gv, character =>
        keep.includes(character) ? character : JSON.stringify(character).slice(1, -1)
    );
