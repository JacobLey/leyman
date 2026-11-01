import { mkdir, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { compiledSpec, findProject, specLabel } from '#project';
import { withWorkspace } from '../../helpers/workspace.js';

suite('project', () => {
    const fixed = { name: 'a', root: '/a', runner: 'mocha' } as const;

    suite('findProject', () => {
        const withFixture = withWorkspace();

        withFixture.test('Finds nearest project, and its runner', async ({ workspace }) => {
            const mocha = await workspace.addProject({ name: 'a' });
            const vitest = await workspace.addProject({ name: 'b', runner: 'vitest' });

            expect(await findProject(mocha.spec)).to.deep.equal({
                name: 'a',
                root: mocha.root,
                runner: 'mocha',
            });
            expect(await findProject(vitest.spec)).to.deep.equal({
                name: 'b',
                root: vitest.root,
                runner: 'vitest',
            });
        });

        withFixture.test('Skips an unreadable project', async ({ workspace }) => {
            const { root, spec } = await workspace.addProject({ name: 'a' });
            const nested = Path.join(root, 'test', 'unit');
            await mkdir(nested, { recursive: true });
            await writeFile(Path.join(nested, 'project.json'), 'not json');

            const project = await findProject(spec);
            expect(project?.name).to.equal('a');
        });

        withFixture.test('Nothing above a file outside any project', async ({ workspace }) => {
            expect(await findProject(Path.join(workspace.root, 'a.spec.ts'))).to.equal(undefined);
        });
    });

    suite('compiledSpec', () => {
        for (const [spec, compiled] of [
            ['unit/a.spec.ts', 'dist-test/unit/a.spec.js'],
            ['unit/a.spec.tsx', 'dist-test/unit/a.spec.js'],
            ['integration/b/a.spec.mts', 'dist-test/integration/b/a.spec.mjs'],
            ['unit/a.spec.cts', 'dist-test/unit/a.spec.cjs'],
        ] as const) {
            test(`${spec} compiles to ${compiled}`, () => {
                expect(compiledSpec(fixed, `/a/test/${spec}`)).to.equal(compiled);
            });
        }
    });

    test('specLabel is relative to the test directory', () => {
        expect(specLabel(fixed, '/a/test/unit/b/a.spec.ts')).to.equal('unit/b/a.spec.ts');
    });
});
