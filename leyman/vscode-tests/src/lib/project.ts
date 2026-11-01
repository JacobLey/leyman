import { readFile } from 'node:fs/promises';
import Path from 'node:path';

export interface Project {
    readonly name: string;
    readonly root: string;
    readonly runner: 'mocha' | 'vitest';
}

const readProject = async (root: string): Promise<Project | undefined> => {
    try {
        const { name, targets } = JSON.parse(
            await readFile(Path.join(root, 'project.json'), 'utf8')
        ) as {
            name: string;
            targets: Record<string, unknown>;
        };
        return { name, root, runner: 'vitest-unit-test' in targets ? 'vitest' : 'mocha' };
    } catch {
        return undefined;
    }
};

/**
 * The project a file belongs to.
 *
 * @param file - path of the file
 * @returns the nearest directory with a `project.json`, if any
 */
export const findProject = async (file: string): Promise<Project | undefined> => {
    const directory = Path.dirname(file);
    const project = await readProject(directory);
    return project || Path.dirname(directory) === directory ? project : findProject(directory);
};

/**
 * Where `tsc-test` compiles a spec to: `test/unit/a.spec.ts` to `dist-test/unit/a.spec.js`.
 *
 * @param project - where the spec lives
 * @param spec - absolute location of the spec
 * @returns path relative to the project
 */
export const compiledSpec = (project: Project, spec: string): string => {
    const fromTest = Path.relative(Path.join(project.root, 'test'), spec);
    return Path.join(
        'dist-test',
        fromTest
            .replace(/\.tsx?$/v, '.js')
            .replace(/\.mts$/v, '.mjs')
            .replace(/\.cts$/v, '.cjs')
    );
};

/**
 * How a spec is named in the list of tests.
 *
 * @param project - where the spec lives
 * @param spec - absolute location of the spec
 * @returns path relative to the project's `test` directory
 */
export const specLabel = (project: Project, spec: string): string =>
    Path.relative(Path.join(project.root, 'test'), spec).split(Path.sep).join('/');
