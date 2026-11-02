import { compile } from 'json-schema-to-typescript';
import { jsonSchemaToZod } from 'json-schema-to-zod';
import openapiTS, { astToString } from 'openapi-typescript';
import { FetchingJSONSchemaStore, InputData, JSONSchemaInput, quicktype } from 'quicktype-core';
import { genever } from 'genever';

/**
 * Turns a document into TypeScript source exporting its type as `Subject`.
 */
export type Generate = (document: object) => string | Promise<string>;

/**
 * A tool in the comparison.
 */
export interface Tool {
    /**
     * Name shown in the report.
     */
    readonly name: string;
    /**
     * Its npm package, for its version and link.
     */
    readonly packageName: string;
    /**
     * Whether to time it. A tool that infers in the type system does its work while type-checking, and type-check cost
     * isn't compared. One that doesn't read references would look fast only by skipping the work.
     */
    readonly timed: boolean;
    /**
     * Generates from a JSON Schema.
     */
    readonly jsonSchema?: Generate;
    /**
     * Generates from an OpenAPI document.
     */
    readonly openApi?: Generate;
}

const inline = (document: object): string => JSON.stringify(document);

/**
 * The tool the comparison is about.
 */
export const geneverTool: Tool = {
    name: 'genever',
    packageName: 'genever',
    timed: true,
    jsonSchema: document => `${genever(document)}\nexport type Subject = Schema;`,
    openApi: document => `${genever(document)}\nexport type Subject = Paths;`,
};

/**
 * The top tools for generating TypeScript types from JSON Schema or OpenAPI.
 */
export const alternativeTools: readonly Tool[] = [
    {
        name: 'json-schema-to-typescript',
        packageName: 'json-schema-to-typescript',
        timed: true,
        jsonSchema: async (document: object): Promise<string> =>
            compile(document, 'Subject', { bannerComment: '' }),
    },
    {
        name: 'quicktype',
        packageName: 'quicktype-core',
        timed: true,
        jsonSchema: async (document: object): Promise<string> => {
            const input = new JSONSchemaInput(new FetchingJSONSchemaStore());
            await input.addSource({ name: 'Subject', schema: inline(document) });
            const inputData = new InputData();
            inputData.addInput(input);
            const { lines } = await quicktype({
                inputData,
                lang: 'typescript',
                rendererOptions: { 'just-types': 'true' },
            });
            return lines.join('\n');
        },
    },
    {
        name: 'json-schema-to-zod',
        packageName: 'json-schema-to-zod',
        timed: false,
        jsonSchema: document =>
            [
                jsonSchemaToZod(document, { module: 'esm', name: 'subject' }),
                'export type Subject = z.infer<typeof subject>;',
            ].join('\n'),
    },
    {
        name: 'json-schema-to-ts',
        packageName: 'json-schema-to-ts',
        timed: false,
        jsonSchema: document =>
            [
                "import type { FromSchema } from 'json-schema-to-ts';",
                `const schema = ${inline(document)} as const;`,
                'export type Subject = FromSchema<typeof schema>;',
            ].join('\n'),
    },
    {
        name: 'TypeBox',
        packageName: 'typebox',
        timed: false,
        jsonSchema: document =>
            [
                "import type { XStatic } from 'typebox/schema';",
                `const schema = ${inline(document)} as const;`,
                'export type Subject = XStatic<typeof schema>;',
            ].join('\n'),
    },
    {
        name: 'openapi-typescript',
        packageName: 'openapi-typescript',
        timed: true,
        openApi: async document =>
            `${astToString(await openapiTS(inline(document)))}\nexport type Subject = paths;`,
    },
];
