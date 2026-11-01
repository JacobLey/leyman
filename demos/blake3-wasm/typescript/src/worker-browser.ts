import { expose } from 'comlink';
import init, { hash } from '@leyman/demo-blake3-wasm-rust';

const ready = init();

// Listening before the `.wasm` has loaded: a message posted before there is a listener is lost
expose({
    hash: async (bytes: Uint8Array) => {
        await ready;
        return hash(bytes);
    },
});
