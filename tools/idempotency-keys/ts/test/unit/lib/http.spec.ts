import { expect } from '@leyman/expect';
import { problemResponse } from 'idempotency-keys';
import { suite, test } from 'mocha-chain';
import { requestTarget } from '#internal/lib/http.js';
import { vectors } from '../../helpers/vectors.js';

/**
 * The URL of a request with a raw target, as the vectors' README says: an absolute-form target (an HTTP or HTTPS
 * scheme, in any case) is the URL, and any other follows the origin.
 *
 * @param raw - As on the request line
 * @returns What `Request.url` holds
 */
const requestUrl = (raw: string): string =>
    /^https?:/iv.test(raw) ? raw : `https://example.com${raw}`;

suite('requestTarget', () => {
    for (const { raw, target } of vectors.targets) {
        test(`Hashes ${JSON.stringify(raw)} as ${target}`, () => {
            expect(requestTarget(requestUrl(raw))).to.equal(target);
        });
    }

    test('Leaves out credentials and the port', () => {
        expect(requestTarget('https://user:pw@example.com:8443/notes?a=1')).to.equal('/notes?a=1');
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
