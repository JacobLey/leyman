import type { HandleOptions, IdempotencyKeysOptions, ProblemKind } from 'idempotency-keys';
import pDefer from 'p-defer';
import { expect } from '@leyman/expect';
import { IdempotencyKeys, ValkeyStore } from 'idempotency-keys';
import { beforeEach, suite } from 'mocha-chain';
import { closeValkey, valkeyContext } from '../helpers/valkey.js';
import { vectors } from '../helpers/vectors.js';

const options: HandleOptions = { scope: 'user_1', operation: 'createNote' };

/**
 * Builds a request to create a note.
 *
 * @param init - What differs from the usual request
 * @param init.key - `Idempotency-Key` header, if any
 * @param init.body - Body text
 * @param init.headers - Other headers
 * @returns A note's create request
 */
const createNote = ({
    key = 'k1',
    body = '{"title":"Hi"}',
    headers = {},
}: {
    key?: string | null;
    body?: string;
    headers?: Record<string, string>;
} = {}): Request =>
    new Request('http://localhost/notes', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(key !== null && { 'idempotency-key': key }),
            ...headers,
        },
        body,
    });

const created = (): Response => {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', 'a=1');
    headers.append('set-cookie', 'b=2');
    return new Response('{"id":"n_1"}', { status: 201, statusText: 'Created', headers });
};

/**
 * A handler that counts its runs.
 *
 * @param respond - Makes each response
 * @returns Handler, and how many times it ran
 */
const handler = (respond: (request: Request) => Promise<Response> | Response = created) => {
    let runs = 0;
    return {
        run: async (request: Request) => {
            runs++;
            return respond(request);
        },
        runs: () => runs,
    };
};

suite('handle', () => {
    const withContext = beforeEach(valkeyContext);
    withContext.afterEach(closeValkey);
    const withKeys = withContext.beforeEach(({ valkey, prefix }) => {
        const store = new ValkeyStore({ connection: valkey, prefix });
        return {
            store,
            create: (more: Partial<IdempotencyKeysOptions> = {}) =>
                new IdempotencyKeys({ store, ...more }),
        };
    });

    withKeys.test('Runs a request without a key as it is', async ({ create }) => {
        const response = created();
        expect(
            await create().handle(createNote({ key: null }), options, async () => response)
        ).to.equal(response);
    });

    withKeys.test(
        'Answers a request without a key with a 400 when the operation requires one',
        async ({ create }) => {
            const { run, runs } = handler();
            const response = await create().handle(
                createNote({ key: null }),
                { ...options, required: true },
                run
            );
            expect(response.status).to.equal(400);
            expect(runs()).to.equal(0);
        }
    );

    withKeys.test('Answers a key it cannot read with a 400', async ({ create }) => {
        const response = await create().handle(
            createNote({ key: '"unterminated' }),
            options,
            handler().run
        );
        expect(response.status).to.equal(400);
        expect(await response.json()).to.include({ status: 400, title: 'Bad Request' });
    });

    withKeys.test('Runs a request with a key, and returns its response', async ({ create }) => {
        const response = await create().handle(createNote(), options, handler().run);
        expect(response.status).to.equal(201);
        expect(response.statusText).to.equal('Created');
        expect(response.headers.getSetCookie()).to.deep.equal(['a=1', 'b=2']);
        expect(await response.text()).to.equal('{"id":"n_1"}');
    });

    withKeys.test('Passes the request to run with its body unread', async ({ create }) => {
        const response = await create().handle(
            createNote(),
            options,
            async request => new Response(await request.text())
        );
        expect(await response.text()).to.equal('{"title":"Hi"}');
    });

    withKeys.test('Replays the response once, marked Idempotent-Replayed', async ({ create }) => {
        const keys = create();
        const { run, runs } = handler();
        await keys.handle(createNote(), options, run);
        const replay = await keys.handle(createNote(), options, run);
        expect(runs()).to.equal(1);
        expect(replay.status).to.equal(201);
        expect(replay.headers.get('idempotent-replayed')).to.equal('true');
        expect(replay.headers.get('content-type')).to.equal('application/json');
        expect(replay.headers.getSetCookie()).to.deep.equal(['a=1', 'b=2']);
        expect(await replay.text()).to.equal('{"id":"n_1"}');
    });

    withKeys.test('Replays a response without a body', async ({ create }) => {
        const keys = create();
        const { run } = handler(() => new Response(null, { status: 204 }));
        await keys.handle(createNote(), options, run);
        const replay = await keys.handle(createNote(), options, run);
        expect(replay.status).to.equal(204);
        expect(replay.body).to.equal(null);
    });

    withKeys.test('Runs again after a 429', async ({ create }) => {
        const keys = create();
        const { run, runs } = handler(() => new Response(null, { status: 429 }));
        await keys.handle(createNote(), options, run);
        await keys.handle(createNote(), options, run);
        expect(runs()).to.equal(2);
    });

    withKeys.test('Answers a key reused on a different body with a 422', async ({ create }) => {
        const keys = create();
        await keys.handle(createNote(), options, handler().run);
        const response = await keys.handle(
            createNote({ body: '{"title":"Bye"}' }),
            options,
            handler().run
        );
        expect(response.status).to.equal(422);
        expect(response.headers.get('content-type')).to.equal('application/problem+json');
    });

    withKeys.test('Answers a duplicate of a running request with a 409', async ({ create }) => {
        const keys = create({ waitMs: 0 });
        const started = pDefer();
        const finish = pDefer<Response>();
        const first = keys.handle(createNote(), options, async () => {
            started.resolve();
            return finish.promise;
        });
        await started.promise;
        const duplicate = await keys.handle(createNote(), options, handler().run);
        expect(duplicate.status).to.equal(409);
        finish.resolve(created());
        const response = await first;
        expect(response.status).to.equal(201);
    });

    withKeys.test('Keeps the key held when the request rejects', async ({ create }) => {
        const keys = create({ waitMs: 0 });
        const failure = new Error('Crashed');
        await expect(
            keys.handle(createNote(), options, async () => {
                throw failure;
            })
        ).to.be.rejectedWith(failure);
        const retry = await keys.handle(createNote(), options, handler().run);
        expect(retry.status).to.equal(409);
    });

    withKeys.test('Fingerprints the headers it names, and no others', async ({ create }) => {
        const keys = create({ fingerprintHeaders: ['X-Tenant'] });
        await keys.handle(
            createNote({ headers: { 'x-tenant': 't1', 'x-trace': '1' } }),
            options,
            handler().run
        );
        const otherTrace = await keys.handle(
            createNote({ headers: { 'x-tenant': 't1', 'x-trace': '2' } }),
            options,
            handler().run
        );
        const otherTenant = await keys.handle(
            createNote({ headers: { 'x-tenant': 't2' } }),
            options,
            handler().run
        );
        expect([otherTrace.status, otherTenant.status]).to.deep.equal([201, 422]);
    });

    withKeys.test('Fingerprints a request as the spec does', async ({ create }) => {
        const keys = create({ fingerprintHeaders: ['content-type'] });
        const vector = vectors.fingerprints.find(
            ({ description }) => description === 'a named header'
        )!;
        const request = new Request(`http://localhost${vector.target}`, {
            method: vector.method,
            headers: [...vector.headers, ['idempotency-key', 'k1']] as [string, string][],
            body: vector.body,
        });
        await keys.handle(request, options, handler().run);
        expect(
            await keys.begin({ ...options, key: 'k1', fingerprint: vector.fingerprint })
        ).to.have.property('outcome', 'replay');
    });

    withKeys.test(
        'Answers each problem with its own response when given one',
        async ({ create }) => {
            const kinds: ProblemKind[] = [];
            const keys = create({
                waitMs: 0,
                problem: kind => {
                    kinds.push(kind);
                    return new Response(null, { status: 418 });
                },
            });
            const response = await keys.handle(createNote({ key: '' }), options, handler().run);
            expect(response.status).to.equal(418);
            expect(kinds).to.deep.equal(['invalid-key']);
        }
    );
});
