// Entry point of the frontend bundle, importing the package as an app would
import { consistentHash, hashKey } from '@leyman/constant-consistent-hash-wasm';

declare global {
    /**
     * The package under test, assigned once it has loaded.
     */
    var consistentHashWasm: {
        consistentHash: typeof consistentHash;
        hashKey: typeof hashKey;
    };
}

// eslint-disable-next-line unicorn/no-global-object-property-assignment -- Read from the page by the tests
globalThis.consistentHashWasm = { consistentHash, hashKey };
