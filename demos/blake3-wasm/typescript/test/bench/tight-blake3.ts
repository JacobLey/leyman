/* eslint-disable @typescript-eslint/no-implied-eval, no-new-func, sonarjs/code-eval -- Writes its fastest form as source */

const MESSAGE_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];
const ROUNDS = 7;

// Each column, then each diagonal, of the state: 4 state indexes, and which 2 message words of the round's schedule
const MIXES = [
    [0, 4, 8, 12, 0, 1],
    [1, 5, 9, 13, 2, 3],
    [2, 6, 10, 14, 4, 5],
    [3, 7, 11, 15, 6, 7],
    [0, 5, 10, 15, 8, 9],
    [1, 6, 11, 12, 10, 11],
    [2, 7, 8, 13, 12, 13],
    [3, 4, 9, 14, 14, 15],
] as const;

const mix = (a: number, b: number, c: number, d: number, x: number, y: number): string =>
    `v${a}=(v${a}+v${b}+m${x})|0;t=v${d}^v${a};v${d}=(t>>>16)|(t<<16);v${c}=(v${c}+v${d})|0;t=v${b}^v${c};v${b}=(t>>>12)|(t<<20);` +
    `v${a}=(v${a}+v${b}+m${y})|0;t=v${d}^v${a};v${d}=(t>>>8)|(t<<24);v${c}=(v${c}+v${d})|0;t=v${b}^v${c};v${b}=(t>>>7)|(t<<25);`;

const rounds = (): string => {
    let schedule = Array.from({ length: 16 }, (_, i) => i);
    const lines: string[] = [];
    for (let round = 0; round < ROUNDS; round++) {
        const current = schedule;
        lines.push(...MIXES.map(([a, b, c, d, x, y]) => mix(a, b, c, d, current[x]!, current[y]!)));
        schedule = MESSAGE_PERMUTATION.map(index => current[index]!);
    }
    return lines.join('\n');
};

const words = (count: number, line: (index: number) => string): string =>
    Array.from({ length: count }, (_, index) => line(index)).join('');

const source = `
const IV = Int32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);
const cv = new Int32Array(8), block = new Int32Array(16), stack = new Int32Array(8 * 54);

const compress = (counterLow, counterHigh, length, flags) => {
    ${words(16, i => `const m${i} = block[${i}];`)}
    ${words(8, i => `let v${i} = cv[${i}];`)}
    let v8 = IV[0], v9 = IV[1], v10 = IV[2], v11 = IV[3], v12 = counterLow, v13 = counterHigh, v14 = length, v15 = flags, t;
    ${rounds()}
    ${words(8, i => `cv[${i}] = v${i} ^ v${i + 8};`)}
};

const readBlock = (bytes, offset, length) => {
    const whole = length >>> 2;
    let p = offset;
    for (let i = 0; i < whole; i++, p += 4) {
        block[i] = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24);
    }
    for (let i = whole; i < 16; i++) block[i] = 0;
    for (let i = 0; i < (length & 3); i++) block[whole] |= bytes[p + i] << (8 * i);
};

const parent = (index, flags) => {
    for (let i = 0; i < 8; i++) {
        block[i] = stack[index * 8 + i];
        block[i + 8] = cv[i];
        cv[i] = IV[i];
    }
    compress(0, 0, 64, flags);
};

return bytes => {
    const CHUNK_START = 1, CHUNK_END = 2, PARENT = 4, ROOT = 8;
    const chunks = Math.max(Math.ceil(bytes.length / 1024), 1);
    let depth = 0;
    for (let chunk = 0; chunk < chunks; chunk++) {
        const end = Math.min((chunk + 1) * 1024, bytes.length);
        const low = chunk | 0, high = Math.floor(chunk / 4294967296) | 0;
        cv.set(IV);
        let offset = chunk * 1024, flags = CHUNK_START;
        while (end - offset > 64) {
            readBlock(bytes, offset, 64);
            compress(low, high, 64, flags);
            offset += 64;
            flags = 0;
        }
        readBlock(bytes, offset, end - offset);
        flags |= CHUNK_END;
        const isLast = chunk === chunks - 1;
        if (isLast && depth === 0) {
            compress(0, 0, end - offset, flags | ROOT);
        } else {
            compress(low, high, end - offset, flags);
            if (isLast) {
                while (depth > 0) {
                    depth--;
                    parent(depth, depth === 0 ? PARENT | ROOT : PARENT);
                }
            } else {
                for (let total = chunk + 1; total % 2 === 0; total /= 2) {
                    depth--;
                    parent(depth, PARENT);
                }
                stack.set(cv, depth * 8);
                depth++;
            }
        }
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
        const word = cv[i];
        out[i * 4] = word;
        out[i * 4 + 1] = word >>> 8;
        out[i * 4 + 2] = word >>> 16;
        out[i * 4 + 3] = word >>> 24;
    }
    return out;
};
`;

/**
 * BLAKE3 at the fastest JavaScript I could write, as the fair baseline for WebAssembly: every step inlined, all state in
 * local variables and nothing allocated per block. Written for that alone, so not for use. Writing it this way, rather
 * than as a helper called per mix, makes it 3.3x faster.
 *
 * @param bytes - to hash
 * @returns 32 bytes
 */
export const tightBlake3 = (new Function(source) as () => (bytes: Uint8Array) => Uint8Array)();
