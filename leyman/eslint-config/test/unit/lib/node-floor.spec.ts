import { expect } from 'chai';
import { suite, test } from 'mocha';
import { getNodeFloor, nodeFloorRules } from '#internal/lib/node-floor.js';

suite('getNodeFloor', () => {
    test('Reads the major version of engines.node', () => {
        expect(getNodeFloor({ name: 'fake', engines: { node: '>=22' } })).to.equal(22);
        expect(getNodeFloor({ name: 'fake', engines: { node: '>= 24.22.1' } })).to.equal(24);
    });

    test('Defaults to the running Node.js', () => {
        expect(getNodeFloor({ name: 'fake' })).to.equal(
            Number(process.versions.node.split('.', 1)[0])
        );
    });

    test('Rejects a range without a floor', () => {
        expect(() => getNodeFloor({ name: 'fake', engines: { node: '^22' } })).to.throw(
            'engines.node must be ">=<version>" to name a floor, not "^22"'
        );
    });
});

suite('nodeFloorRules', () => {
    test('Turns off rules for APIs newer than the floor', () => {
        expect(nodeFloorRules({ name: 'fake', engines: { node: '>=22' } })).to.deep.equal({
            'unicorn/prefer-error-is-error': 'off',
            'unicorn/prefer-iterator-concat': 'off',
            'unicorn/prefer-iterator-zip': 'off',
            'unicorn/prefer-promise-try': 'off',
            'unicorn/prefer-regexp-escape': 'off',
            'unicorn/prefer-uint8array-base64': 'off',
            'unicorn/prefer-uint8array-hex': 'off',
        });
    });

    test('Keeps rules for APIs the floor has', () => {
        expect(nodeFloorRules({ name: 'fake', engines: { node: '>=26' } })).to.deep.equal({
            'unicorn/prefer-iterator-zip': 'off',
        });
    });
});
