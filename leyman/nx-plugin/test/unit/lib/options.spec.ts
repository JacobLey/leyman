import { expect } from '@leyman/expect';
import { resolveOptions, targetNames } from '@leyman/nx-plugin';
import { suite, test } from 'mocha-chain';

suite('resolveOptions', () => {
    test('Defaults to the published packages', () => {
        const options = resolveOptions();

        expect(options.targets.tsc).to.deep.equal({ name: 'tsc', include: [], exclude: [] });
        expect(Object.keys(options.targets)).to.deep.equal(targetNames);
        expect(options.configs).to.deep.equal({
            swc: 'node_modules/@leyman/configs/swcrc.jsonc',
            c8: 'node_modules/@leyman/configs/c8rc.json',
            vitest: 'node_modules/@leyman/configs/vitest.config.js',
        });
        expect(options.scripts).to.equal(undefined);
        expect(options.checkPackage).to.deep.equal({
            profile: undefined,
            floorTsconfig: '@leyman/configs/tsconfig.node-{major}.json',
            inputs: [{ externalDependencies: ['@leyman/check-package', 'typescript'] }],
        });
        expect(options.inputs).to.deep.equal({
            configs: [{ externalDependencies: ['@leyman/configs'] }],
            tools: [{ externalDependencies: ['@leyman/nx-plugin'] }],
        });
        expect(options.namedInputs['test-source']).to.deep.equal([]);
    });

    test('Keeps what is given', () => {
        const options = resolveOptions({
            targets: { tsc: { name: 'build-ts' }, biome: false },
            configs: { swc: 'a', c8: 'b', vitest: 'c' },
            scripts: 'd',
            coverage: { lines: 90 },
            checkPackage: { profile: 'esm-only', floorTsconfig: false, inputs: [] },
            inputs: { configs: ['e'], tools: ['f'] },
            namedInputs: { 'test-source': ['g'] },
        });

        expect(options.targets.tsc).to.deep.equal({ name: 'build-ts', include: [], exclude: [] });
        expect(options.targets.biome).to.equal(false);
        expect(options.configs).to.deep.equal({ swc: 'a', c8: 'b', vitest: 'c' });
        expect(options.scripts).to.equal('d');
        expect(options.coverage).to.deep.equal({ lines: 90 });
        expect(options.checkPackage).to.deep.equal({
            profile: 'esm-only',
            floorTsconfig: false,
            inputs: [],
        });
        expect(options.inputs).to.deep.equal({ configs: ['e'], tools: ['f'] });
        expect(options.namedInputs['test-source']).to.deep.equal(['g']);
    });
});
