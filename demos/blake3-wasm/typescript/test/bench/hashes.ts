// Each hash behind a dynamic import, so a bundler splits them and the cold bench loads only the one it measures
export const loaders = {
    noble: async () => {
        const { blake3 } = await import('@noble/hashes/blake3.js');
        return blake3;
    },
    tight: async () => {
        const { tightBlake3 } = await import('./tight-blake3.js');
        return tightBlake3;
    },
    wasm: async () => {
        const { hash } = await import('@leyman/demo-blake3-wasm');
        return hash;
    },
} as const;

export type HashName = keyof typeof loaders;
