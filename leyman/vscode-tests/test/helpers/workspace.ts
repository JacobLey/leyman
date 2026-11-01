import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { beforeEach } from 'mocha-chain';

const NODE_MODULES = Path.join(import.meta.dirname, '..', '..', 'node_modules');

/**
 * Stands in for `nx`: only `test:compile` of a project named `broken*` fails.
 */
const NX = `#!/bin/sh
echo "nx $*"
case "$2" in
  broken*) exit 1 ;;
  slow*) sleep 30 ;;
esac
`;

export const SPEC_SOURCE = `import { beforeEach, suite, test } from 'mocha-chain';

suite('outer', () => {
    const withValue = beforeEach(() => ({ value: 1 }));

    withValue.test('passes', () => {});
    test('fails', () => {});
    test('fails with diff', () => {});
    test.skip('is skipped', () => {});
    test('passes too', () => {});

    suite('inner', () => {
        test('nested', () => {});
    });

    for (const name of ['one']) {
        test(\`made at \${name}\`, () => {});
    }
});
`;

const MOCHA_COMPILED = `import assert from 'node:assert';

describe('outer', () => {
    it('passes', () => {});
    it('fails', () => {
        throw new Error('<FAILS>');
    });
    it('fails with diff', () => {
        assert.deepStrictEqual({ a: 1 }, { a: 2 });
    });
    it.skip('is skipped', () => {});
    it('passes too', () => {});
    describe('inner', () => {
        it('nested', () => {});
    });
    it('made at one', () => {});
});
`;

export interface Workspace {
    readonly root: string;
    readonly addProject: (options: {
        name: string;
        runner?: 'mocha' | 'vitest';
        compiled?: string;
        source?: string;
        spec?: string;
    }) => Promise<{ root: string; spec: string }>;
}

const write = async (path: string, text: string): Promise<void> => {
    await mkdir(Path.dirname(path), { recursive: true });
    await writeFile(path, text);
};

/**
 * A workspace of real files in a temporary directory, with this package's own runners installed.
 * Called inside each suite that needs one.
 *
 * @returns chain of tests that receive the workspace
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- The type of a chain is only useful inferred
export const withWorkspace = () => {
    const handle = beforeEach(async () => {
        const root = await mkdtemp(Path.join(tmpdir(), 'vscode-tests-workspace-'));
        const nx = Path.join(root, 'leyman', 'main', 'node_modules', '.bin', 'nx');
        await write(nx, NX);
        await chmod(nx, 0o755);
        await write(
            Path.join(root, 'configs', 'vitest.config.js'),
            `export default { test: { include: ['dist-test/unit/**/*.spec.js'] } };\n`
        );

        const workspace: Workspace = {
            root,
            addProject: async ({
                name,
                runner = 'mocha',
                compiled = MOCHA_COMPILED,
                source = SPEC_SOURCE,
                spec = 'unit/sample.spec.ts',
            }) => {
                const project = Path.join(root, name);
                await write(
                    Path.join(project, 'project.json'),
                    JSON.stringify({
                        name,
                        targets: {
                            [runner === 'vitest' ? 'vitest-unit-test' : 'mocha-unit-test']: {},
                        },
                    })
                );
                await symlink(NODE_MODULES, Path.join(project, 'node_modules'));
                const specPath = Path.join(project, 'test', spec);
                await write(specPath, source);
                await write(
                    Path.join(project, 'dist-test', spec.replace(/\.ts$/v, '.js')),
                    compiled
                );
                return { root: project, spec: specPath };
            },
        };
        return { workspace };
    });
    handle.afterEach(async ({ workspace }) => {
        await rm(workspace.root, { recursive: true, force: true });
    });
    return handle;
};
