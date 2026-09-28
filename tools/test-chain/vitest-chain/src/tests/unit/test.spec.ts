import * as vitest from 'vitest';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    it,
    suite,
    test,
} from 'vitest-chain';

const { expect, expectTypeOf } = vitest;

describe('test', () => {
    test('Receives vitest context', ({ task, expect: contextExpect }) => {
        expect(task.name).toBe('Receives vitest context');
        contextExpect(it).toBe(test);
        expectTypeOf(it).toEqualTypeOf(test);
    });

    test('Supports async tests', async () => {
        await expect(Promise.resolve(1)).resolves.toBe(1);
    });

    test.skip('Can skip test', () => {
        throw new Error('<ERROR>');
    });

    describe('Declaring inside a test fails', () => {
        const message = 'Cannot create new hook/suite/test while executing a hook/test';

        test('test', () => {
            expect(() => {
                test('Never runs', () => {});
            }).toThrow(message);
        });

        test('describe', () => {
            expect(() => {
                describe('Never runs', () => {});
            }).toThrow(message);
        });

        test('hooks', () => {
            expect(() => beforeAll(() => {})).toThrow(message);
            expect(() => beforeEach(() => {})).toThrow(message);
            expect(() => afterEach(() => {})).toThrow(message);
            expect(() => afterAll(() => {})).toThrow(message);
        });
    });
});

suite('describe', () => {
    describe.skip('Skipped suite', () => {
        test('Never runs', () => {
            throw new Error('<ERROR>');
        });
    });

    describe('Async suite', async () => {
        await Promise.resolve();

        test('Registered after await', () => {
            expect(suite).toBe(describe);
        });
    });
});
