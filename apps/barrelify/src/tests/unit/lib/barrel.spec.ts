import { expect } from 'chai';
import { dedent } from 'ts-dedent';
import { suite, test } from 'mocha-chain';
import { generateBarrelFile } from '../../../lib/barrel.js';

suite('barrel', () => {
    suite('generateBarrelFile', () => {
        test('empty file', () => {
            expect(
                generateBarrelFile(
                    ['foo.ts', 'bar.mts', 'baz.cts'],
                    dedent`
                        // AUTO-BARREL
                    `
                )
            ).to.equal(
                dedent`
                    // AUTO-BARREL

                    export * from './bar.mjs';
                    export * from './baz.cjs';
                    export * from './foo.js';

                `
            );
        });

        test('Files declared with types', () => {
            expect(
                generateBarrelFile(
                    ['foo.ts', 'bar.mts', 'baz.cts'],
                    dedent`
                        // AUTO-BARREL

                        export * from './bar.mjs';
                        export type * from './baz.cjs';
                        export type * from './ignore.js';
                        export type * from './foo.ts';

                    `
                )
            ).to.equal(
                dedent`
                    // AUTO-BARREL

                    export * from './bar.mjs';
                    export type * from './baz.cjs';
                    export type * from './foo.js';

                `
            );
        });

        test('foo', async () => {
            await import('../../data/commonjs/types.cjs');
        });
    });
});
