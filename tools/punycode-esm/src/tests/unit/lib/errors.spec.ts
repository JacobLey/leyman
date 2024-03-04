import { expect } from 'chai';
import { suite, test } from 'mocha-hookup';
import * as Errors from '#errors';

suite('errors', () => {
    suite('checkOverflow', () => {
        suite('success', () => {
            test('Less than', () => {
                Errors.checkOverflow(1, 2);
            });

            test('Less than (gte)', () => {
                Errors.checkOverflow(1, 2, { gte: true });
            });

            test('Equal to', () => {
                Errors.checkOverflow(1, 1);
            });
        });

        suite('failure', () => {
            test('Greater than', () => {
                expect(() => {
                    Errors.checkOverflow(2, 1);
                }).to.throw(RangeError);
            });

            test('Greater than (gte)', () => {
                expect(() => {
                    Errors.checkOverflow(2, 1, { gte: true });
                }).to.throw('Overflow: input needs wider integers to process');
            });

            test('Equal to', () => {
                expect(() => {
                    Errors.checkOverflow(1, 1, {
                        gte: true,
                        error: 'invalid-input',
                    });
                }).to.throw('Invalid input');
            });
        });
    });
});
