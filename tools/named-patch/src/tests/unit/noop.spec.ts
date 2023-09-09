import { expect } from 'chai';
import { suite, test } from 'mocha-hookup';
import * as Noop from 'named-patch';

suite('noop', () =>  {

    test('Returns input unchanged', () => {

        const original = <
            A extends string,
            B = [123]
        >(a: A, b: B[]): { a: [A]; b: B[]; c: boolean } => ({ a: [a], b, c: true });
        Object.freeze(original);
        const patched = Noop.patch(original);
        expect(patched).to.equal(patched);
    });
});