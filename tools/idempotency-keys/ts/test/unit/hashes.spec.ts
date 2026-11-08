import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { computeFingerprint, computeIdentity } from 'idempotency-keys';
import { suite, test } from 'mocha-chain';
import { vectors } from '../helpers/vectors.js';

const encoder = new TextEncoder();

suite('Hashes', () => {
    suite('computeIdentity', () => {
        for (const { description, identity, ...input } of vectors.identities) {
            test(`Hashes ${description}`, async () => {
                expect(await computeIdentity(input)).to.equal(identity);
            });
        }

        test('Resolves to hex', () => {
            expectTypeOf(computeIdentity).returns.toEqualTypeOf<Promise<string>>();
        });
    });

    suite('computeFingerprint', () => {
        for (const { description, fingerprint, ...input } of vectors.fingerprints) {
            test(`Hashes ${description}`, async () => {
                expect(await computeFingerprint(input)).to.equal(fingerprint);
            });
        }

        test('Hashes a body given as bytes as its UTF-8 string', async () => {
            const [vector] = vectors.fingerprints;
            const { fingerprint, ...input } = vector!;
            expect(
                await computeFingerprint({ ...input, body: encoder.encode(input.body) })
            ).to.equal(fingerprint);
        });

        test('Hashes named headers the same whatever order they are listed in', async () => {
            const vector = vectors.fingerprints.find(({ description }) =>
                description.startsWith('named headers are hashed')
            )!;
            const { fingerprint, ...input } = vector;
            expect(
                await computeFingerprint({ ...input, named: ['accept', 'content-type'] })
            ).to.equal(fingerprint);
        });

        test('Takes the headers of a Request as they are', async () => {
            const vector = vectors.fingerprints.find(({ description }) =>
                description.startsWith('repeated values')
            )!;
            const { fingerprint, headers, ...input } = vector;
            expect(
                await computeFingerprint({
                    ...input,
                    headers: new Headers(headers as [string, string][]),
                })
            ).to.equal(fingerprint);
        });
    });
});
