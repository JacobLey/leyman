import { decodeJwt } from 'jose';
import sinon from 'sinon';
import { clientCredentials, NotesMcpAuthorizationServerError } from '@leyman/demo-agents-mcp';
import { listenDevAuthorizationServer } from '@leyman/demo-oauth-server';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';

const resource = 'https://notes-api.test';
// Characters Basic authentication must encode (RFC 6749 §2.3.1)
const service = { clientId: 'service', clientSecret: 'p%s+s:w rd', scopes: ['notes:read'] };

suite('clientCredentials', () => {
    /**
     * A dev authorization server, issuing tokens that last as long as the test says.
     */
    const withServer = beforeEach(() => ({
        start: async (accessTokenTtl: number) =>
            listenDevAuthorizationServer({
                resources: [{ url: resource, scopes: ['notes:read', 'notes:write'] }],
                clients: [],
                services: [service],
                accountId: 'dev-user',
                accessTokenTtl,
            }),
    }));

    withServer.test('Gets a token for the resource, as the service', async ({ start }) => {
        const server = await start(600);
        try {
            const token = await clientCredentials({
                issuer: server.issuer,
                resource,
                ...service,
            })();

            expect(decodeJwt(token)).to.include({
                aud: resource,
                client_id: service.clientId,
                scope: 'notes:read',
            });
        } finally {
            await server.close();
        }
    });

    withServer.test('Shares one token until it nears expiry', async ({ start }) => {
        const server = await start(600);
        try {
            const token = clientCredentials({ issuer: server.issuer, resource, ...service });

            const [first, second] = await Promise.all([token(), token()]);

            expect(second).to.equal(first);
            expect(await token()).to.equal(first);
        } finally {
            await server.close();
        }
    });

    withServer.test('Gets another once a token nears expiry', async ({ start }) => {
        const server = await start(600);
        // Only the clock: requests still run in real time
        const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
        try {
            const token = clientCredentials({ issuer: server.issuer, resource, ...service });
            const first = await token();

            // Still 30 seconds left: the same token
            clock.tick(569_000);
            expect(await token()).to.equal(first);

            // Within 30 seconds of expiry: another
            clock.tick(2000);
            expect(await token()).to.not.equal(first);
        } finally {
            clock.restore();
            await server.close();
        }
    });

    withServer.test('Rejects, and tries again, when the secret is wrong', async ({ start }) => {
        const server = await start(600);
        try {
            const token = clientCredentials({
                issuer: server.issuer,
                resource,
                ...service,
                clientSecret: 'wrong',
            });

            await expect(token()).to.be.rejectedWith(
                NotesMcpAuthorizationServerError,
                "refused the server's credentials (401)"
            );
            await expect(token()).to.be.rejectedWith(NotesMcpAuthorizationServerError);
        } finally {
            await server.close();
        }
    });

    withServer.test(
        'Rejects, and tries again, when there is no discovery document',
        async ({ start }) => {
            const server = await start(600);
            try {
                const token = clientCredentials({
                    issuer: `${server.issuer}/nowhere`,
                    resource,
                    ...service,
                });

                await expect(token()).to.be.rejectedWith(
                    NotesMcpAuthorizationServerError,
                    'discovery answered 404'
                );
                await expect(token()).to.be.rejectedWith(
                    NotesMcpAuthorizationServerError,
                    'discovery answered 404'
                );
            } finally {
                await server.close();
            }
        }
    );

    withServer.test('Rejects a discovery document for another issuer', async ({ start }) => {
        const server = await start(600);
        try {
            // Found without the trailing slash, but naming the issuer without it
            const token = clientCredentials({ issuer: `${server.issuer}/`, resource, ...service });

            await expect(token()).to.be.rejectedWith(
                NotesMcpAuthorizationServerError,
                'named another issuer'
            );
        } finally {
            await server.close();
        }
    });
});
