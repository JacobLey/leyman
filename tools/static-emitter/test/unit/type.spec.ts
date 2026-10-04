import { suite, test } from 'mocha-chain';

suite('static-emitter', () => {
    test('coverage', async () => {
        await import('#internal/lib/types.js');
        await import('#internal/lib/static-event-target/type.js');
        await import('#internal/lib/typed-event/type.js');
    });
});
