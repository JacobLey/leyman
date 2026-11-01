// Entry point of the frontend bundle, importing the package as an app would
import * as blake3 from '@leyman/demo-blake3-wasm';

declare global {
    /**
     * The package under test.
     */
    var blake3Wasm: typeof blake3;
}

// eslint-disable-next-line unicorn/no-global-object-property-assignment -- Read from the page by the tests
globalThis.blake3Wasm = blake3;
