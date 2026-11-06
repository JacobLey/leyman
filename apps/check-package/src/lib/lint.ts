import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

/**
 * Lints the tarball with publint in strict mode: entry points exist and are well formed.
 *
 * @param tarball - the packed package
 * @returns errors and warnings as problems, suggestions apart
 */
export const lintProblems = async (
    tarball: Uint8Array
): Promise<{ problems: string[]; suggestions: string[] }> => {
    const { messages, pkg } = await publint({
        pack: {
            tarball: tarball.buffer.slice(
                tarball.byteOffset,
                tarball.byteOffset + tarball.byteLength
            ) as ArrayBuffer,
        },
        strict: true,
    });
    const problems: string[] = [];
    const suggestions: string[] = [];
    for (const message of messages) {
        // The code names the rule, and the formatted text is missing only for a code publint doesn't know
        const text = [
            `publint ${message.type} ${message.code}:`,
            formatMessage(message, pkg, { color: false }),
        ]
            .filter(Boolean)
            .join(' ');
        (message.type === 'suggestion' ? suggestions : problems).push(text);
    }
    return { problems, suggestions };
};
