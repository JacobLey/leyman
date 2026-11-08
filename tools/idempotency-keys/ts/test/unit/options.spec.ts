import type { IdempotencyStore } from 'idempotency-keys';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import {
    defaultRespondPolicy,
    IdempotencyKeys,
    IdempotencyKeysError,
    IdempotencyKeysOptionError,
} from 'idempotency-keys';
import { suite, test } from 'mocha-chain';

/**
 * A store these tests never reach, as every option is checked first.
 */
const store: IdempotencyStore = {
    claim: async () => {
        throw new Error('Unreachable');
    },
    complete: async () => {
        throw new Error('Unreachable');
    },
    release: async () => {
        throw new Error('Unreachable');
    },
};

const fingerprint = '0'.repeat(64);

suite('Options', () => {
    for (const [option, value] of [
        ['ttlMs', 0],
        ['ttlMs', 1.5],
        ['ttlMs', Number.NaN],
        ['ttlMs', Number.POSITIVE_INFINITY],
        ['leaseMs', 0],
        ['leaseMs', -1],
        ['waitMs', -1],
        ['waitMs', 0.5],
    ] as const) {
        test(`Rejects ${option} of ${value}`, () => {
            expect(() => new IdempotencyKeys({ store, [option]: value })).to.throw(
                IdempotencyKeysOptionError
            );
        });
    }

    test('Rejects a leaseMs not below ttlMs', () => {
        expect(() => new IdempotencyKeys({ store, ttlMs: 1000, leaseMs: 1000 })).to.throw(
            IdempotencyKeysOptionError
        );
    });

    test('Accepts a waitMs of 0', () => {
        expect(new IdempotencyKeys({ store, waitMs: 0 })).to.be.instanceOf(IdempotencyKeys);
    });

    test('Rejects an empty scope', async () => {
        const keys = new IdempotencyKeys({ store });
        await expect(keys.begin({ scope: '', key: 'k', fingerprint })).to.be.rejectedWith(
            IdempotencyKeysOptionError
        );
    });

    test('Rejects an empty operation', async () => {
        const keys = new IdempotencyKeys({ store });
        await expect(
            keys.begin({ scope: 's', operation: '', key: 'k', fingerprint })
        ).to.be.rejectedWith(IdempotencyKeysOptionError);
    });

    for (const part of ['scope', 'operation', 'key'] as const) {
        test(`Rejects a ${part} that isn't well-formed Unicode`, async () => {
            const keys = new IdempotencyKeys({ store });
            await expect(
                keys.begin({
                    scope: 's',
                    operation: 'o',
                    key: 'k',
                    [part]: 'a\u{D800}',
                    fingerprint,
                })
            ).to.be.rejectedWith(IdempotencyKeysOptionError);
        });
    }

    test('Rejects an empty key', async () => {
        const keys = new IdempotencyKeys({ store });
        await expect(keys.begin({ scope: 's', key: '', fingerprint })).to.be.rejectedWith(
            IdempotencyKeysOptionError
        );
    });

    test('Names the option in the error', () => {
        expect(() => new IdempotencyKeys({ store, waitMs: -1 }))
            .to.throw(IdempotencyKeysError)
            .with.property('option', 'waitMs');
    });

    suite('defaultRespondPolicy', () => {
        const body = new Uint8Array();

        test('Releases a 429', () => {
            expect(defaultRespondPolicy({ status: 429, headers: [], body })).to.equal('release');
        });

        for (const status of [200, 201, 400, 409, 500, 503]) {
            test(`Completes a ${status}`, () => {
                expect(defaultRespondPolicy({ status, body, headers: [] })).to.equal('complete');
            });
        }

        test('Is typed as a choice of two', () => {
            expectTypeOf(defaultRespondPolicy).returns.toEqualTypeOf<'complete' | 'release'>();
        });
    });
});
