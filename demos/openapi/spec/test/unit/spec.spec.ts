import type { OpenAPIV3_1 } from 'openapi-types';
import SwaggerParser from '@apidevtools/swagger-parser';
import { expect } from '@leyman/expect';
import { formatText } from 'format-file';
import { genever, parseYaml } from 'genever';
import { suite, test } from 'mocha-chain';
import fileContent from '#internal/file-content.js';
import { spec } from '#internal/spec.js';

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

interface Operation {
    readonly operationId?: string;
    readonly security?: readonly Record<string, readonly string[]>[];
    readonly responses: Record<string, unknown>;
}

/**
 * List the spec's operations.
 *
 * @returns Every operation in the spec, with its method
 */
const operations = (): { readonly method: string; readonly operation: Operation }[] =>
    Object.values(
        spec.paths as Record<string, Partial<Record<(typeof methods)[number], Operation>>>
    ).flatMap(path =>
        methods
            .filter(method => path[method] !== undefined)
            .map(method => ({ method, operation: path[method]! }))
    );

suite('spec', () => {
    test('Is a valid OpenAPI 3.1 document, with every $ref resolving', async () => {
        // The parser dereferences in place, so it gets a copy
        // Juniper's JSON Schema types and openapi-types' differ in detail (e.g. `const` tuples), so it is cast once
        await SwaggerParser.validate(structuredClone(spec) as unknown as OpenAPIV3_1.Document);
    });

    test('Names every operation', () => {
        const ids = operations().map(({ operation }) => operation.operationId);

        expect(ids).to.deep.equal(['listNotes', 'createNote', 'getNote']);
    });

    test('Requires a bearer token for every operation, with a scope to read or write', () => {
        for (const { method, operation } of operations()) {
            const scope = method === 'get' ? 'notes:read' : 'notes:write';
            expect(operation.security).to.deep.equal([{ bearer: [scope] }]);
            expect(operation.responses).to.have.property('401');
            expect(operation.responses).to.have.property('403');
        }
    });

    test('Defines the security scheme operations use', () => {
        expect(spec.components.securitySchemes.bearer).to.deep.equal({
            type: 'http',
            scheme: 'bearer',
        });
    });

    test('Answers a request that does not match with 400', () => {
        for (const { operation } of operations()) {
            expect(operation.responses).to.have.property('400');
        }
    });

    test('Writes the spec to openapi.json and notes.openapi.yaml, the same document', () => {
        const [json, yaml] = fileContent;

        expect(json).to.deep.equal({ filePath: './openapi.json', content: spec });
        expect(yaml.filePath).to.equal('./notes.openapi.yaml');
        expect(parseYaml(yaml.content)).to.deep.equal(spec);
    });

    test("Writes genever's types beside notes.openapi.yaml, for tools that can't run the content mapper", async () => {
        const [, yaml, sidecar] = fileContent;

        expect(sidecar).to.deep.equal({
            filePath: './notes.openapi.d.yaml.ts',
            content: await formatText(
                genever(parseYaml(yaml.content), { parameterDefaults: true }),
                {
                    ext: '.ts',
                }
            ),
        });
    });
});
