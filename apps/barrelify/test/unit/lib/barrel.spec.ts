import { dedent } from 'ts-dedent';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { generateBarrelFile, parseTypes } from '#internal/lib/barrel.js';

suite('barrel', () => {
    suite('parseTypes', () => {
        test('Detects javascript files', () => {
            expect(
                parseTypes(dedent`
                    // AUTO BARREL

                    export type * from './bar.mjs';
                    export type * from './baz.cjs';
                    export type * from './foo.js';
                    export * from './ignore.js';

                `)
            ).to.deep.equal(
                new Set(['bar.mjs', 'bar.mts', 'baz.cjs', 'baz.cts', 'foo.js', 'foo.ts'])
            );
        });

        test('Detects typescript files', () => {
            expect(
                parseTypes(dedent`
                    // AUTO BARREL

                    export type * from './bar.mts';
                    export type * from './baz.cts';
                    export type * from './foo.ts';
                    export * from './ignore.ts';

                `)
            ).to.deep.equal(
                new Set(['bar.mjs', 'bar.mts', 'baz.cjs', 'baz.cts', 'foo.js', 'foo.ts'])
            );
        });
    });

    suite('generateBarrelFile', () => {
        test('empty file', () => {
            expect(
                generateBarrelFile({
                    files: ['foo.ts', 'bar.mts', 'baz.cts'],
                    types: new Set(),
                })
            ).to.equal(
                dedent`
                    // AUTO-BARREL

                    export * from './bar.mjs';
                    export * from './baz.cjs';
                    export * from './foo.js';

                `
            );
        });

        test('tsx files', () => {
            expect(
                generateBarrelFile({
                    files: ['Button.tsx', 'Button.ts', 'card.tsx'],
                    types: new Set(['card.js']),
                })
            ).to.equal(
                dedent`
                    // AUTO-BARREL

                    export * from './Button.js';
                    export type * from './card.js';

                `
            );
        });

        test('Files declared with types', () => {
            expect(
                generateBarrelFile({
                    files: ['foo.ts', 'bar.mts', 'baz.cts'],
                    types: new Set(['foo.js', 'ignore.js', 'baz.cjs']),
                })
            ).to.equal(
                dedent`
                    // AUTO-BARREL

                    export * from './bar.mjs';
                    export type * from './baz.cjs';
                    export type * from './foo.js';

                `
            );
        });
    });
});
