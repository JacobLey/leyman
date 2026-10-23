import { chmod, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { SessionStore } from '@leyman/demo-agents-cli';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';

suite('SessionStore', () => {
    const withDirectory = beforeEach(async () => {
        const directory = await mkdtemp(Path.join(tmpdir(), 'notes-session-'));
        return { directory, store: new SessionStore(directory) };
    });
    withDirectory.afterEach(async ({ directory }) => {
        await chmod(directory, 0o700);
        await rm(directory, { recursive: true, force: true });
    });

    suite('locked', () => {
        withDirectory.test('Runs one at a time', async ({ store }) => {
            const ran: string[] = [];
            const run = async (name: string): Promise<void> =>
                store.locked(async () => {
                    ran.push(`${name} starts`);
                    await sleep(20);
                    ran.push(`${name} ends`);
                });

            await Promise.all([run('first'), run('second')]);

            expect(ran).to.have.length(4);
            expect(ran[1]).to.equal(ran[0]!.replace('starts', 'ends'));
        });

        withDirectory.test(
            'Takes over a lock left by a command that died',
            async ({ directory, store }) => {
                const lock = Path.join(directory, 'session.lock');
                await writeFile(lock, '');
                // In seconds
                const minuteAgo = (Date.now() - 60_000) / 1000;
                await utimes(lock, minuteAgo, minuteAgo);

                expect(await store.locked(async () => 'ran')).to.equal('ran');
            }
        );

        withDirectory.test(
            "Rejects when the lock can't be created",
            async ({ directory, store }) => {
                await chmod(directory, 0o500);

                await expect(store.locked(async () => 'ran')).to.be.rejectedWith(/EACCES/v);
            }
        );
    });
});
