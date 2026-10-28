/* eslint-disable import-x/no-extraneous-dependencies -- The whole file is only loaded by the populate-files target */
import type { PopulateFileParams } from 'load-populate-files';
import { stringify } from 'yaml';
import { formatText } from 'format-file';
import { genever, parseYaml } from 'genever';
import { spec } from './spec.js';

const yaml = stringify(spec);

export default [
    { filePath: './openapi.json', content: spec },
    { filePath: './notes.openapi.yaml', content: yaml },
    {
        // The types `genever-content-mapper` gives `notes.openapi.yaml`, for tools that can't run content mappers
        // (typescript-eslint, TypeScript before 7.1), through `allowArbitraryExtensions`. TypeScript 7.1 running the
        // mapper ignores it. With `OperationRequest`, which only the server uses
        filePath: './notes.openapi.d.yaml.ts',
        content: await formatText(genever(parseYaml(yaml), { parameterDefaults: true }), {
            ext: '.ts',
        }),
    },
] as const satisfies readonly PopulateFileParams[];
