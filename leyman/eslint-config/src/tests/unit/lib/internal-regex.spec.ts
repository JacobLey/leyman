import { expect } from 'chai';
import { suite, test } from 'mocha';
import { getInternalRegex } from '../../../lib/internal-regex.js';

suite('getInternalRegex', () => {
    test('success', () => {
        expect(
            getInternalRegex({
                name: '@scope/name',
                dependencies: {
                    nope: '1.2.3',
                    foo: 'workspace:^',
                },
                peerDependencies: {
                    'dupli-cate': 'workspace:^',
                    '@other-scope/Bar_2': 'workspace:*',
                },
                optionalDependencies: {
                    'dupli-cate': 'workspace:^',
                    ignore: '>2',
                },
            })
        ).to.deep.equal(
            // eslint-disable-next-line unicorn/escape-case, unicorn/no-hex-escape
            /^(?:@other\x2dscope\/Bar_2(?:$|\/)|@scope\/name(?:$|\/)|dupli\x2dcate(?:$|\/)|foo(?:$|\/))/u
        );
    });
});
