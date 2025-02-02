import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import * as changeCase from 'change-case';
import { Eta } from 'eta';
import { file as tmpFile } from 'tmp-promise';
import type { ParameterNames, TemplateContext } from './lib/types.js';

const execFileAsync = promisify(execFile);
const eta = new Eta();
const compiledTemplate = new Eta()
    .compile(
        await readFile(Path.join(import.meta.dirname, '../../src/generate/main.go.eta'), 'utf8')
    )
    .bind(eta);

export type GenerateGoFile = (context: TemplateContext) => Promise<string>;

export const generateGoFile: GenerateGoFile = async (context: TemplateContext): Promise<string> => {
    const hasCi = [...context.targets.values()].some(target => target.isCi);

    const allParameters = new Set(
        [
            ...context.targets.values(),
            [...context.runtimes.values()].flatMap(runtime => [
                runtime.preBuild,
                runtime.postBuild,
            ]),
        ]
            .flat()
            .flatMap(({ parameters }) => parameters)
    );
    const hasDependencyProjectDirs = allParameters.has('dependencyProjectDirectories');
    const hasDirectDependencyProjectDirs = allParameters.has('directDependencyProjectDirectories');
    const hasOutput = allParameters.has('output');
    const hasProjectSource = allParameters.has('projectSource');

    const rendered = compiledTemplate({
        ...context,
        changeCase,
        conditionals: {
            hasCi,
            hasDependencyProjectDirs,
            hasDirectDependencyProjectDirs,
            hasOutput,
            hasProjectSource,
        },
        parametersMap: {
            source: 'm.Source',
            output: 'output',
            projectDir: 'string(projectDir)',
            projectSource: 'projectSource',
            projectOutput: 'built',
            dependencyProjectDirectories: 'dependencyProjectDirs',
            directDependencyProjectDirectories: 'directDependencyProjectDirs',
        } satisfies Record<ParameterNames, string>,
    });

    const file = await tmpFile({ postfix: '.go' });

    await writeFile(file.path, rendered, 'utf8');

    await execFileAsync('gofmt', ['-w', file.path]);

    const data = await readFile(file.path, 'utf8');
    await file.cleanup();

    return data;
};
