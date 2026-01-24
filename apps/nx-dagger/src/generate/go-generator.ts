import type { ParameterNames, TemplateContext } from './lib/types.js';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import * as changeCase from 'change-case';
import { Eta } from 'eta';
import { file as tmpFile } from 'tmp-promise';

const execFileAsync = promisify(execFile);
const eta = new Eta();
const [mainTemplate, mainBuilderTemplate] = await Promise.all([
    readFile(Path.join(import.meta.dirname, '../../src/generate/main.go.eta'), 'utf8'),
    readFile(Path.join(import.meta.dirname, '../../src/generate/main-builder.go.eta'), 'utf8'),
]);
const compiledTemplate = eta.compile(mainTemplate).bind(eta);
const compiledBuilderTemplate = eta.compile(mainBuilderTemplate).bind(eta);

interface NxDaggerFiles {
    main: string;
    builder: string;
}
export type GenerateGoFile = (context: TemplateContext) => Promise<NxDaggerFiles>;

export const generateGoFile: GenerateGoFile = async (
    context: TemplateContext
): Promise<NxDaggerFiles> => {
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

    const templateOptions = {
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
    };
    const rendered = compiledTemplate(templateOptions);
    const renderedBuilder = compiledBuilderTemplate(templateOptions);

    const formattedData: NxDaggerFiles = {
        main: '',
        builder: '',
    };
    await Promise.all(
        [
            {
                raw: rendered,
                key: 'main' as const,
            },
            {
                raw: renderedBuilder,
                key: 'builder' as const,
            },
        ].map(async ({ raw, key }) => {
            const file = await tmpFile({ postfix: `-${key}.go` });

            await writeFile(file.path, raw, 'utf8');

            await execFileAsync('gofmt', ['-w', file.path]);

            const data = await readFile(file.path, 'utf8');
            await file.cleanup();

            formattedData[key] = data;
        })
    );

    return formattedData;
};
