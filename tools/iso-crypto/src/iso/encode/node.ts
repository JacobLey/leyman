import { inputToEncoding } from '../lib/input-to-encoding.js';
import { defaultEncoding } from '../lib/types.js';
import type * as Encode from './types.js';

export const decode: (typeof Encode)['decode'] = input => {
    const { encoding, text } = inputToEncoding(input);
    if (encoding === 'raw') {
        return text;
    }
    const normalized =
        encoding === 'hex' && text.length % 2 ? `0${text}` : text;
    return Buffer.from(normalized, encoding);
};

export const encode: (typeof Encode)['encode'] = (
    buffer,
    encoding = defaultEncoding
) => Buffer.from(decode(buffer)).toString(encoding);
