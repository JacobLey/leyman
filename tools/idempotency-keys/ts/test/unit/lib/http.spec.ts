import { expect } from '@leyman/expect';
import { problemResponse } from 'idempotency-keys';
import { suite, test } from 'mocha-chain';
import { requestTarget } from '#internal/lib/http.js';

suite('requestTarget', () => {
    test('Is the path and query', () => {
        expect(requestTarget('https://example.com:8443/notes?draft=1')).to.equal('/notes?draft=1');
    });

    test('Keeps an empty query', () => {
        expect(requestTarget('https://example.com/notes?')).to.equal('/notes?');
    });

    test('Leaves out the fragment', () => {
        expect(requestTarget('https://example.com/notes?a=1#top')).to.equal('/notes?a=1');
    });

    test('Keeps percent-encoding as it is', () => {
        expect(requestTarget('https://example.com/notes/%61')).to.equal('/notes/%61');
    });
});

suite('problemResponse', () => {
    for (const [kind, status] of [
        ['missing-key', 400],
        ['invalid-key', 400],
        ['conflict', 409],
        ['mismatch', 422],
    ] as const) {
        test(`Answers ${kind} with a ${status} problem document`, async () => {
            const response = problemResponse(kind);
            expect(response.status).to.equal(status);
            expect(response.headers.get('content-type')).to.equal('application/problem+json');
            expect(await response.json()).to.include({ type: 'about:blank', status });
        });
    }
});
