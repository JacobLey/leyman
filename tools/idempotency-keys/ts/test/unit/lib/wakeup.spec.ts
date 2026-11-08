import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { Wakeup } from '#internal/lib/wakeup.js';

// Each sleep is far longer than the test's timeout, so a test only passes if the wakeup ends it
const forever = 3_600_000;

suite('Wakeup', () => {
    test('Ends a sleep under way', async () => {
        const wakeup = new Wakeup();
        const sleeping = wakeup.sleep(forever);
        wakeup.wake();
        await sleeping;
    });

    test('Ends the next sleep at once when woken before it', async () => {
        const wakeup = new Wakeup();
        wakeup.wake();
        await wakeup.sleep(forever);
    });

    test('Forgets a wakeup once reset', async () => {
        const wakeup = new Wakeup();
        wakeup.wake();
        wakeup.reset();
        let hasSlept = false;
        const sleeping = (async () => {
            await wakeup.sleep(1);
            hasSlept = true;
        })();
        // A sleep that ended at once would have settled by now
        await Promise.resolve();
        await Promise.resolve();
        expect(hasSlept).to.equal(false);
        await sleeping;
    });

    test('Wakes after the time passes', async () => {
        const wakeup = new Wakeup();
        await wakeup.sleep(1);
        // A later wake has no sleep to end, and doesn't throw
        wakeup.wake();
    });
});
