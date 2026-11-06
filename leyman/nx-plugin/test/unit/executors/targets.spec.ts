import type { Context } from 'mocha';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import targetsExecutor from '#internal/executors/targets.js';

suite('targets executor', () => {
    const withWorkspace = beforeEach(async function (this: Context) {
        this.timeout(5000);
        const root = await mkdtemp(Path.join(Os.tmpdir(), 'nx-plugin-executor-'));
        await mkdir(Path.join(root, 'tools/main'), { recursive: true });
        await mkdir(Path.join(root, 'packages/a'), { recursive: true });
        await writeFile(Path.join(root, 'nx.json'), '{}');
        await writeFile(
            Path.join(root, 'tools/main/nx-plugin.json'),
            JSON.stringify({ targets: { biome: { name: 'format' } } })
        );
        await writeFile(Path.join(root, 'packages/a/project.json'), JSON.stringify({ name: 'a' }));
        const context = {
            root,
            projectsConfigurations: { version: 2, projects: { a: { root: 'packages/a' } } },
        };
        return { root, context };
    });
    withWorkspace.afterEach(async ({ root }) => {
        await rm(root, { recursive: true, force: true });
    });

    withWorkspace.test('Writes the targets from the options file', async ({ root, context }) => {
        expect(
            await targetsExecutor({ config: 'tools/main/nx-plugin.json', check: false }, context)
        ).to.deep.equal({ success: true });

        const projectJson = JSON.parse(
            await readFile(Path.join(root, 'packages/a/project.json'), 'utf8')
        ) as unknown;
        expect(projectJson).to.deep.equal({ name: 'a', targets: { format: {} } });
    });

    withWorkspace.test('Checks in CI, unless told otherwise', async ({ context }) => {
        // eslint-disable-next-line n/no-process-env -- The default follows CI
        const original = process.env.CI;
        try {
            // eslint-disable-next-line n/no-process-env -- The default follows CI
            process.env.CI = 'true';
            await expect(
                targetsExecutor({ config: 'tools/main/nx-plugin.json' }, context)
            ).to.eventually.be.rejectedWith('Not up to date');

            // eslint-disable-next-line n/no-process-env, require-atomic-updates -- The default follows CI; tests run one at a time
            process.env.CI = 'false';
            await targetsExecutor({ config: 'tools/main/nx-plugin.json' }, context);
            await targetsExecutor({ config: 'tools/main/nx-plugin.json', check: true }, context);
        } finally {
            // eslint-disable-next-line n/no-process-env, require-atomic-updates -- The default follows CI; tests run one at a time
            process.env.CI = original;
        }
    });
});
