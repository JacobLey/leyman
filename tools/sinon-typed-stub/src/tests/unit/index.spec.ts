import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-hookup';
import { define, verifyAndRestore } from 'sinon';
import { mockMethod, spyMethod, stubMethod } from 'sinon-typed-stub';

suite('Wraps sinon methods', () => {

    // Example AJV-esque validator that doesn't map well to Sinon's default breakdown of parameters -> return type
    const validator = Object.assign(
        (val: unknown): val is number => typeof val === 'number',
        {
            errors: null as null | unknown[],
        }
    );

    test('spyMethod wraps spy', () => {

        const spy = spyMethod(validator);

        const myVal = Math.random() > 0.5 ? 123 : 'abc';
        if (spy.method(myVal)) {
            expectTypeOf(myVal).toEqualTypeOf(123);
        }

        expect(spy.spy.calledWithExactly(myVal)).to.equal(true);
    });

    test('stubMethod wraps stub', () => {

        const stub = stubMethod<typeof validator>();

        expectTypeOf(stub.method).toEqualTypeOf(validator);

        stub.stub.returns(false);
        stub.stub.withArgs(123).returns(true);
        
        expect(stub.method(789)).to.equal(false);
        expect(stub.method(123)).to.equal(true);

        expect(stub.spy.callCount).to.equal(2);
    });

    test('mockMethodMethod wraps mock', () => {

        const mock = mockMethod<typeof validator>();
        define(mock.method, 'errors', ['<foo>', '<bar>']);

        expect(mock.method.errors).to.deep.equal(['<foo>', '<bar>']);

        mock.stub.withArgs(123).returns(true);
        
        expect(mock.method(123)).to.equal(true);

        expect(mock.spy.callCount).to.equal(1);

        mock.mock.verify();
    });

    afterEach(() => {
        verifyAndRestore();
    });
});