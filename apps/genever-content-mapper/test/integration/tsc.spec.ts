import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createProject } from './lib/project.js';

const userSchema = [
    'type: object',
    'required: [id]',
    'properties:',
    '  id: { type: string }',
    '  age: { type: integer, minimum: 0 }',
    'additionalProperties: false',
    '',
].join('\n');

suite('tsc', () => {
    const withProject = beforeEach(createProject);
    withProject.afterEach(async ({ project }) => {
        await project.tmpDir.cleanup();
    });

    withProject.test('imports types from a JSON Schema', async ({ project }) => {
        await project.write({
            'user.schema.yaml': userSchema,
            'index.ts': [
                "import type { Schema } from './user.schema.yaml';",
                '',
                "export const user: Schema = { id: 'a', age: 1 };",
                '',
            ].join('\n'),
        });

        expect(await project.check()).to.deep.equal({ code: 0, output: '' });
    });

    withProject.test('the types are checked', async ({ project }) => {
        await project.write({
            'user.schema.yaml': userSchema,
            'index.ts': [
                "import type { Schema } from './user.schema.yaml';",
                '',
                "export const user: Schema = { id: 'a', age: 'old' };",
                '',
            ].join('\n'),
        });

        expect(await project.check()).to.deep.equal({
            code: 2,
            output: "index.ts(3,40): error TS2322: Type 'string' is not assignable to type 'number'.\n",
        });
    });

    withProject.test('imports types from an OpenAPI document', async ({ project }) => {
        await project.write({
            'notes.openapi.yaml': [
                'openapi: 3.1.0',
                'info: { title: Notes, version: "1" }',
                'paths: {}',
                'components:',
                '  schemas:',
                '    Note: { type: object, required: [body], properties: { body: { type: string } } }',
                '',
            ].join('\n'),
            'index.ts': [
                "import type { Note } from './notes.openapi.yaml';",
                '',
                "export const note: Note = { body: 'hello' };",
                '',
            ].join('\n'),
        });

        expect(await project.check()).to.deep.equal({ code: 0, output: '' });
    });

    withProject.test('with options', async ({ project }) => {
        await project.write(
            {
                'user.schema.yaml': userSchema,
                'index.ts': [
                    "import type { User } from './user.schema.yaml';",
                    '',
                    "export const user: User = { id: 'a' };",
                    '',
                ].join('\n'),
            },
            { name: 'User' }
        );

        expect(await project.check()).to.deep.equal({ code: 0, output: '' });
    });

    withProject.test('invalid options are errors in tsconfig.json', async ({ project }) => {
        // Only once a mapped file is in the program: TypeScript opens the mapper's project on its first transform
        await project.write(
            {
                'user.schema.yaml': userSchema,
                'index.ts':
                    "import type { Schema } from './user.schema.yaml';\n\nexport type User = Schema;\n",
            },
            { strict: 'no' }
        );

        const { code, output } = await project.check();
        expect(code).to.equal(2);
        expect(output).to.match(
            /^tsconfig\.json\(\d+,\d+\): error genever1: Option 'strict' must be a boolean\.\n$/v
        );
    });

    withProject.test('errors in the schema are reported in it', async ({ project }) => {
        await project.write({
            'user.schema.yaml': 'type: object\nproperties:\n  id: { type: string, minLenght: 1 }\n',
            'index.ts':
                "import type { Schema } from './user.schema.yaml';\n\nexport type User = Schema;\n",
        });

        expect(await project.check()).to.deep.equal({
            code: 2,
            output: 'user.schema.yaml(3,23): error genever103: Unknown keyword "minLenght" (at #/properties/id/minLenght)\n',
        });
    });

    withProject.test('a $ref to another file is an error', async ({ project }) => {
        await project.write({
            'user.schema.yaml':
                'type: object\nproperties:\n  address: { $ref: ./address.schema.yaml }\n',
            'address.schema.yaml': 'type: string\n',
            'index.ts':
                "import type { Schema } from './user.schema.yaml';\n\nexport type User = Schema;\n",
        });

        const { code, output } = await project.check();
        expect(code).to.equal(2);
        expect(output).to.match(/^user\.schema\.yaml\(3,14\): error genever104: /v);
    });

    withProject.test('mappers only run with --runExternalCode', async ({ project }) => {
        await project.write({
            'user.schema.yaml': userSchema,
            'index.ts':
                "import type { Schema } from './user.schema.yaml';\n\nexport type User = Schema;\n",
        });

        const { code, output } = await project.check([]);
        expect(code).to.equal(2);
        expect(output).to.contain('error TS18068:');
    });
});
