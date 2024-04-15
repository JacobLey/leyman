import type { Encoding, InputText } from './types.js';

export const inputToEncoding = (
    input: InputText
): { text: string; encoding: Encoding } | { text: Uint8Array; encoding: 'raw' } => {
    if (typeof input === 'string') {
        return {
            text: input,
            encoding: 'utf8',
        };
    }
    if (input instanceof Uint8Array) {
        return {
            text: input,
            encoding: 'raw',
        };
    }
    return input;
};
