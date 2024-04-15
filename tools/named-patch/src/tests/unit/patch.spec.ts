import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { stub, verifyAndRestore } from 'sinon';
import { afterEach, suite, test } from 'mocha-hookup';
import * as Patch from 'named-patch';

suite('namedPatch', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    suite('patch', () => {
        test('With sync', () => {
            const syncMethod = <A extends string, B = [123]>(
                a: A,
                b: B[]
            ): { a: [A]; b: B[]; c: boolean } => ({ a: [a], b, c: true });

            const patched = Patch.patch(syncMethod);
            expect(patched[Patch.patchKey]).to.eq(syncMethod);

            // Cached
            expect(Patch.patch(syncMethod)).to.eq(patched);
            // Idempotent
            expect(Patch.patch(patched)).to.eq(patched);
            // Consistent length
            expect(patched.length).to.equal(2);

            const rawResult = patched('abc', [null]);
            expect(rawResult).to.deep.equal({ a: ['abc'], b: [null], c: true });
            expectTypeOf(rawResult).toEqualTypeOf<{
                a: ['abc'];
                b: null[];
                c: boolean;
            }>();

            const patchedResponse = {
                a: ['<value>'] as [string],
                b: [[]],
                c: false,
            };
            stub(patched, Patch.patchKey).returns(patchedResponse);

            expect(patched('abc', [null])).to.eq(patchedResponse);
            expectTypeOf(patched<'abc', null>('abc', [null])).toEqualTypeOf<{
                a: ['abc'];
                b: null[];
                c: boolean;
            }>();
        });

        test('With async', async () => {
            const asyncMethod = Patch.patch(async (a: number): Promise<number> => a * 2);

            expect(await asyncMethod(2)).to.equal(4);

            stub(asyncMethod, Patch.patchKey).resolves(-5);

            expect(await asyncMethod(2)).to.equal(-5);
        });

        test('With this', () => {
            let counter = 0;

            const context = {
                increment: () => counter++,
                decrement: () => counter--,
            };

            const contextMethod = Patch.patch(function (this: typeof context): void {
                this.increment();
            });

            contextMethod.call(context);
            expect(counter).to.equal(1);

            const container = {
                contextMethod,
                ...context,
            };
            container.contextMethod();
            expect(counter).to.equal(2);

            stub(contextMethod, Patch.patchKey).callsFake(function (this: typeof context) {
                this.decrement();
            });

            container.contextMethod();
            expect(counter).to.equal(1);
        });
    });

    suite('getPatched', () => {
        test('success', () => {
            const method = (): void => {};
            const patched = Patch.patch(method);

            expect(Patch.getPatched(method)).to.eq(patched);
        });

        suite('failure', () => {
            test('Never patched', () => {
                expect(() => Patch.getPatched(() => {})).to.throw(Error, 'Method is un-patched');
            });

            test('Already patched', () => {
                expect(() => Patch.getPatched(Patch.patch(() => {}))).to.throw(
                    Error,
                    'Method is already patched'
                );
            });
        });
    });
});
