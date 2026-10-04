import { expect } from '@leyman/expect';
import { makeValidator } from 'juniper-validator';
import { suite, test } from 'mocha-chain';
import { dependsOnSchema } from '#schemas';

suite('dependsOnSchema', () => {
    const { is } = makeValidator(dependsOnSchema);

    test('Accepts every form Nx accepts', () => {
        expect(
            is([
                'build',
                '^build',
                { target: 'build' },
                { target: 'build', dependencies: true, params: 'forward' },
                { target: 'build', projects: ['foo'] },
                { target: 'build', projects: 'foo' },
            ])
        ).to.equal(true);
    });

    test('Rejects dependencies with projects', () => {
        expect(is([{ target: 'build', projects: ['foo'], dependencies: true }])).to.equal(false);
    });
});
