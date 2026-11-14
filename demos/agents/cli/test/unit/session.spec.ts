import { chmod, mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
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
                const holder = Path.join(directory, 'session.lock', 'died');
                await mkdir(Path.dirname(holder));
                await writeFile(holder, '');
                // In seconds
                const minuteAgo = (Date.now() - 60_000) / 1000;
                await utimes(holder, minuteAgo, minuteAgo);

                expect(await store.locked(async () => 'ran')).to.equal('ran');
            }
        );

        withDirectory.test(
            'Lets only one of the commands waiting on a dead lock take it over',
            async ({ directory, store }) => {
                const holder = Path.join(directory, 'session.lock', 'died');
                let holding = 0;
                let mostHolding = 0;
                const take = async (): Promise<void> =>
                    store.locked(async () => {
                        holding++;
                        mostHolding = Math.max(mostHolding, holding);
                        await sleep(1);
                        holding--;
                    });

                // The race depends on how the file system calls interleave, so it's run several times
                for (let round = 0; round < 4; round++) {
                    await mkdir(Path.dirname(holder));
                    await writeFile(holder, '');
                    // In seconds
                    const minuteAgo = (Date.now() - 60_000) / 1000;
                    await utimes(holder, minuteAgo, minuteAgo);

                    await Promise.all(Array.from({ length: 5 }, take));
                }

                expect(mostHolding).to.equal(1);
                expect(await readdir(directory)).to.deep.equal([]);
            }
        );

        withDirectory.test("Rejects when the lock can't be created", async ({ directory }) => {
            // Short enough to make (Linux paths are at most 4095 bytes), too long for the lock in it.
            // Unlike a read-only directory, this fails for root too, as in CI.
            let deep = directory;
            while (deep.length < 4000) {
                deep = Path.join(deep, 'd'.repeat(200));
            }
            deep = Path.join(deep, 'd'.repeat(4090 - deep.length));
            const store = new SessionStore(deep);

            await expect(store.locked(async () => 'ran')).to.be.rejectedWith(/ENAMETOOLONG/v);
        });

        withDirectory.test(
            "Rejects when something that isn't a lock is in its place",
            async ({ directory, store }) => {
                await writeFile(Path.join(directory, 'session.lock'), '');

                await expect(store.locked(async () => 'ran')).to.be.rejectedWith(/ENOTDIR/v);
                expect(await readdir(directory)).to.deep.equal(['session.lock']);
            }
        );

        withDirectory.test('Makes the directory, owner-only', async ({ directory }) => {
            const made = Path.join(directory, 'notes');
            const store = new SessionStore(made);

            await store.locked(async () => 'ran');

            const { mode } = await stat(made);
            expect(mode.toString(8).slice(-3)).to.equal('700');
        });
    });
});
