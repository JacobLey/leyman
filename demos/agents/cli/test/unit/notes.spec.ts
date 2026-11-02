import type { AddressInfo } from 'node:net';
import type { Session } from '@leyman/demo-agents-cli';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { SessionStore } from '@leyman/demo-agents-cli';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { connect } from '#internal/lib/notes.js';

/**
 * A store where another command refreshes the login while this one waits for the lock, which the CLI's tests can't
 * make happen on demand: its commands are separate processes.
 */
class RefreshedElsewhereStore extends SessionStore {
    readonly #session: Session;

    public constructor(directory: string, session: Session) {
        super(directory);
        this.#session = session;
    }

    public override async locked<T>(use: () => Promise<T>): Promise<T> {
        return super.locked(async () => {
            await this.save(this.#session);
            return use();
        });
    }
}

suite('connect', () => {
    const withApi = beforeEach(async () => {
        const directory = await mkdtemp(Path.join(tmpdir(), 'notes-connect-'));
        const tokens: (string | undefined)[] = [];
        const server = createServer((request, response) => {
            tokens.push(request.headers.authorization);
            response.setHeader('content-type', 'application/json');
            response.end('{"notes":[]}');
        }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const { port } = server.address() as AddressInfo;
        return { directory, server, tokens, api: `http://127.0.0.1:${port}` };
    });
    withApi.afterEach(async ({ directory, server }) => {
        server.close();
        await rm(directory, { recursive: true, force: true });
    });

    withApi.test(
        'Uses the login another command refreshed while it waited, without spending the refresh token',
        async ({ api, directory, tokens }) => {
            const expired: Session = {
                api,
                // Nothing listens here, so refreshing would fail
                issuer: 'http://127.0.0.1:1',
                clientId: 'client',
                accessToken: 'expired',
                refreshToken: 'refresh',
                expiresAt: 0,
            };
            const store = new RefreshedElsewhereStore(directory, {
                ...expired,
                accessToken: 'fresh',
                expiresAt: null,
            });
            await store.save(expired);

            const notes = await connect(store);
            await notes.call('listNotes', {});

            expect(tokens).to.deep.equal(['Bearer fresh']);
        }
    );
});
