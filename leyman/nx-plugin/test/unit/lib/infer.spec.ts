import type { ProjectFacts } from '@leyman/nx-plugin';
import { expect } from '@leyman/expect';
import { inferTargets, resolveOptions } from '@leyman/nx-plugin';
import { suite, test } from 'mocha-chain';

const project = ({
    files = [],
    ...facts
}: Partial<Omit<ProjectFacts, 'has'>> & { files?: string[] }): ProjectFacts => ({
    root: 'packages/a',
    packageJson: {},
    isDependency: false,
    has: path => files.includes(path),
    ...facts,
});

const typescriptFiles = [
    'tsconfig.json',
    'src',
    'test/tsconfig.json',
    'test/unit',
    'eslint.config.js',
];

suite('inferTargets', () => {
    test('Formats every project', () => {
        expect(
            inferTargets(
                project({ packageJson: undefined, files: typescriptFiles }),
                resolveOptions()
            )
        ).to.deep.equal(['biome']);
    });

    test('Infers the targets of a published TypeScript package tested with Mocha', () => {
        expect(
            inferTargets(
                project({
                    isDependency: true,
                    packageJson: { devDependencies: { mocha: '*' } },
                    files: [...typescriptFiles, 'test/integration'],
                }),
                resolveOptions()
            )
        ).to.deep.equal([
            'biome',
            'eslint',
            'check-package',
            'update-ts-references',
            'tsc',
            'tsc-test',
            'mocha-unit-test',
            'mocha-integration-test',
            'coverage-report',
            'sync-injected',
        ]);
    });

    test('Runs unit tests with Vitest without Mocha', () => {
        expect(
            inferTargets(
                project({
                    packageJson: { private: true, devDependencies: { vitest: '*' } },
                    files: [...typescriptFiles, 'test/integration'],
                }),
                resolveOptions()
            )
        ).to.deep.equal([
            'biome',
            'eslint',
            'update-ts-references',
            'tsc',
            'tsc-test',
            'vitest-unit-test',
            'coverage-report',
        ]);
    });

    test('Prefers Mocha when both are installed', () => {
        expect(
            inferTargets(
                project({
                    packageJson: { private: true, devDependencies: { mocha: '*', vitest: '*' } },
                    files: typescriptFiles,
                }),
                resolveOptions()
            )
        )
            .to.include('mocha-unit-test')
            .and.not.include('vitest-unit-test');
    });

    test('Checks no coverage, nor the package, without source', () => {
        expect(
            inferTargets(
                project({
                    packageJson: { devDependencies: { mocha: '*' } },
                    files: ['tsconfig.json', 'test/tsconfig.json', 'test/integration'],
                }),
                resolveOptions()
            )
        ).to.deep.equal(['biome', 'update-ts-references', 'tsc-test', 'mocha-integration-test']);
    });

    test('Runs no tests without a runner', () => {
        expect(inferTargets(project({ files: typescriptFiles }), resolveOptions())).to.deep.equal([
            'biome',
            'eslint',
            'check-package',
            'update-ts-references',
            'tsc',
            'tsc-test',
        ]);
    });

    test('Includes, excludes and turns off targets', () => {
        expect(
            inferTargets(
                project({ files: ['tsconfig.json', 'src', 'eslint.config.js'] }),
                resolveOptions({
                    targets: {
                        biome: false,
                        eslint: { exclude: ['packages/a'] },
                        'mocha-integration-test': { include: ['packages/a'] },
                        'sync-injected': { include: ['packages/b'] },
                    },
                })
            )
        ).to.deep.equal(['check-package', 'update-ts-references', 'tsc', 'mocha-integration-test']);
    });
});
