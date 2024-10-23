import type fs from 'node:fs/promises';
import Path from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { identifier } from 'haywire';
import type { BuildOptions } from './schema.js';

export interface NormalizedOptions extends BuildOptions {
    projectDir: string;
    isModule: boolean;
}

export type NormalizeOptions = (
    options: BuildOptions,
    context: ExecutorContext
) => Promise<NormalizedOptions>;
export const normalizeOptionsId = identifier<NormalizeOptions>();

interface PackageJson {
    type?: 'commonjs' | 'module';
}

const isPackageJson = (content: unknown): content is PackageJson =>
    !!content && typeof content === 'object';

export const normalizeOptionsProvider =
    (readFile: typeof fs.readFile): NormalizeOptions =>
    async (options, context) => {
        const projectDir = Path.resolve(
            context.root,
            context.projectsConfigurations.projects[context.projectName!]!.root
        );

        const file = await readFile(Path.join(projectDir, 'package.json'), 'utf8');

        const rawPackageJson: unknown = JSON.parse(file);
        if (isPackageJson(rawPackageJson)) {
            return {
                tsConfig: Path.resolve(context.root, options.tsConfig),
                projectDir,
                isModule: rawPackageJson.type === 'module',
            };
        }

        throw new Error('Unable to parse package.json file');
    };
