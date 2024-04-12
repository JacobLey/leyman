import { suite, test } from 'mocha-hookup';

suite('static-emitter', () => {
    test('coverage', async () => {
        await import('../../lib/types.js');
        await import('../../lib/static-event-target/type.js');
        await import('../../lib/typed-event/type.js');
    });
});
