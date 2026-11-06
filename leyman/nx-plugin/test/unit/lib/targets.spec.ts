import type { TargetConfiguration } from '@nx/devkit';
import { expect } from '@leyman/expect';
import { namedInputs, resolveOptions, targetConfigurations } from '@leyman/nx-plugin';
import { suite, test } from 'mocha-chain';

const commands = (target: TargetConfiguration): string[] =>
    (target.options as { commands: string[] }).commands;

suite('targetConfigurations', () => {
    test('Runs the bins with the installed configs by default', () => {
        const targets = targetConfigurations(resolveOptions());

        expect(commands(targets.tsc)).to.deep.equal([
            'leyman-clean-dist',
            'leyman-swc-compile ./src ./dist node_modules/@leyman/configs/swcrc.jsonc',
            // eslint-disable-next-line no-template-curly-in-string -- The shell's syntax
            '${TSC:-tsc}',
        ]);
        expect(commands(targets['coverage-report'])).to.deep.equal([
            'leyman-coverage-report node_modules/@leyman/configs/c8rc.json',
        ]);
        expect(commands(targets['check-package'])).to.deep.equal([
            'check-package --floor-tsconfig @leyman/configs/tsconfig.node-{major}.json',
        ]);
        expect(commands(targets['vitest-unit-test'])[0]).to.include(
            'vitest run --config node_modules/@leyman/configs/vitest.config.js --root .'
        );
        expect(commands(targets['sync-injected'])).to.deep.equal(['leyman-sync-injected']);
        expect(targets['sync-injected']).to.not.have.property('dependsOn');
    });

    test('Runs scripts from a directory, with the options given', () => {
        const targets = targetConfigurations(
            resolveOptions({
                scripts: '$ROOT/scripts',
                configs: { swc: "it's.jsonc", c8: 'c8 rc.json' },
                coverage: { branches: 90, lines: 95 },
                checkPackage: { profile: 'esm-only', floorTsconfig: false },
            })
        );

        expect(commands(targets.tsc).slice(0, 2)).to.deep.equal([
            '$ROOT/scripts/clean-dist.sh',
            String.raw`$ROOT/scripts/swc-compile.sh ./src ./dist 'it'\''s.jsonc'`,
        ]);
        expect(commands(targets.biome)).to.deep.equal(['$ROOT/scripts/biome-format.sh']);
        expect(commands(targets['coverage-report'])).to.deep.equal([
            "$ROOT/scripts/coverage-report.sh 'c8 rc.json' --branches 90 --lines 95",
        ]);
        expect(commands(targets['check-package'])).to.deep.equal([
            'check-package --profile esm-only',
        ]);
        expect(commands(targets['sync-injected'])).to.deep.equal([
            '$ROOT/scripts/sync-injected.mjs',
        ]);
    });
});

suite('namedInputs', () => {
    test('Hashes the configs and tools, and appends what is given', () => {
        const inputs = namedInputs(
            resolveOptions({
                inputs: {
                    configs: ['{workspaceRoot}/configs/*'],
                    tools: ['{workspaceRoot}/scripts/*'],
                },
                namedInputs: { 'test-source': ['{projectRoot}/schema.sql'] },
            })
        );

        expect(inputs['ts-source']).to.include.members([
            '{workspaceRoot}/configs/*',
            '{workspaceRoot}/scripts/*',
        ]);
        expect(inputs['test-source'].at(-1)).to.equal('{projectRoot}/schema.sql');
        expect(inputs['dependency-builds']).to.deep.include({
            dependentTasksOutputFiles: '**/dist/**/*.wasm',
            transitive: true,
        });
    });
});
