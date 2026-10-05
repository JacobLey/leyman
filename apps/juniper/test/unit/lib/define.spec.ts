import type { SchemaType } from 'juniper';
import type { AvailableProperties } from '../../types.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import {
    arraySchema,
    components,
    defineRecursive,
    mergeSchema,
    numberSchema,
    objectSchema,
    RecursiveSchema,
    stringSchema,
} from 'juniper';
import { suite, test } from 'mocha-chain';

suite('define', () => {
    const address = objectSchema({
        properties: { city: stringSchema() },
        required: ['city'],
    }).define('Address');
    const user = objectSchema({
        properties: {
            id: numberSchema({ type: 'integer' }),
            name: stringSchema(),
            home: address,
            work: address,
        },
        required: ['id', 'name'],
        additionalProperties: false,
    }).define('User');

    const addressJson = {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
    };
    const userJson = {
        type: 'object',
        properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            home: { $ref: '#/$defs/Address' },
            work: { $ref: '#/$defs/Address' },
        },
        required: ['id', 'name'],
        additionalProperties: false,
    };

    test('Emits a $ref, with every definition in $defs', () => {
        expect(user.toJSON()).to.deep.equal({
            $ref: '#/$defs/User',
            $defs: { Address: addressJson, User: userJson },
        });
        expectTypeOf<SchemaType<typeof user>>().branded.toEqualTypeOf<{
            id: number;
            name: string;
            home?: { city: string };
            work?: { city: string };
        }>();
    });

    test('Definitions used inside other schemas are collected', () => {
        const schema = arraySchema(user);
        expect(schema.toJSON({ id: 'users', schema: true })).to.deep.equal({
            type: 'array',
            items: { $ref: '#/$defs/User' },
            $defs: { Address: addressJson, User: userJson },
            $id: 'users',
            $schema: 'https://json-schema.org/draft/2020-12/schema',
        });
        expect(mergeSchema().allOf(address).toJSON()).to.deep.equal({
            allOf: [{ $ref: '#/$defs/Address' }],
            $defs: { Address: addressJson },
        });
    });

    test('Validates with Ajv in strict mode', () => {
        const validate = new Ajv2020({ strict: true }).compile<SchemaType<typeof user>>(
            arraySchema(user).toJSON()
        );
        expect(validate([{ id: 1, name: 'Ann', home: { city: 'Paris' } }])).to.equal(true);
        expect(validate([{ id: 1, name: 'Ann', home: {} }])).to.equal(false);
        expect(validate([{ id: 1.5, name: 'Ann' }])).to.equal(false);
    });

    suite('Derived schemas', () => {
        test('Annotations keep the reference', () => {
            expect(
                objectSchema({
                    properties: { home: address.description('Home').title('Home address') },
                }).toJSON()
            ).to.deep.equal({
                type: 'object',
                properties: {
                    home: { $ref: '#/$defs/Address', description: 'Home', title: 'Home address' },
                },
                $defs: { Address: addressJson },
            });
        });

        test('Nullable wraps the reference', () => {
            const schema = objectSchema({ properties: { home: address.nullable() } });
            expect(schema.toJSON()).to.deep.equal({
                type: 'object',
                properties: { home: { anyOf: [{ $ref: '#/$defs/Address' }, { type: 'null' }] } },
                $defs: { Address: addressJson },
            });
            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'object',
                properties: {
                    home: { nullable: true, allOf: [{ $ref: '#/components/schemas/Address' }] },
                },
            });

            const validate = new Ajv2020({ strict: true }).compile(schema.toJSON());
            expect(validate({ home: null })).to.equal(true);
            expect(validate({ home: { city: 'Paris' } })).to.equal(true);
            expect(validate({ home: {} })).to.equal(false);
        });

        test('Other changes are emitted inline, without the unused definition', () => {
            expect(user.omit(['id', 'home', 'work']).toJSON()).to.deep.equal({
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
                additionalProperties: false,
            });
            expect(user.nullable().minProperties(1).toJSON()).to.deep.equal({
                ...userJson,
                type: ['object', 'null'],
                minProperties: 1,
                $defs: { Address: addressJson },
            });
        });
    });

    test('Different schemas with the same name fail', () => {
        const other = objectSchema().define('User');
        expect(() => objectSchema({ properties: { a: user, b: other } }).toJSON()).to.throw(
            'Different schemas are defined with the same name: "User"'
        );
        // The same schema can be used any number of times
        expect(() => objectSchema({ properties: { a: user, b: user } }).toJSON()).not.to.throw();
    });

    test('Defining a referenced schema references the reference', () => {
        expect(stringSchema().ref('#/external').define('External').toJSON()).to.deep.equal({
            $ref: '#/$defs/External',
            $defs: { External: { $ref: '#/external' } },
        });
    });

    suite('OpenAPI', () => {
        test('OpenAPI 3.0 references components, without $defs', () => {
            expect(user.toJSON({ openApi30: true })).to.deep.equal({
                $ref: '#/components/schemas/User',
            });
        });

        test('components() collects every definition', () => {
            const post = objectSchema({
                properties: { author: user, title: stringSchema() },
            });
            expect(components([post, address], { openApi30: true })).to.deep.equal({
                User: {
                    ...userJson,
                    properties: {
                        ...userJson.properties,
                        home: { $ref: '#/components/schemas/Address' },
                        work: { $ref: '#/components/schemas/Address' },
                    },
                },
                Address: addressJson,
            });
        });

        test('Other paths are left to the caller', () => {
            const definitionsPath = '#/components/schemas/';
            expect(user.toJSON({ definitionsPath })).to.deep.equal({
                $ref: '#/components/schemas/User',
            });
            expect(Object.keys(components([user]))).to.deep.equal(['Address', 'User']);
            expect(components([address], { definitionsPath: '#/definitions/' })).to.deep.equal({
                Address: addressJson,
            });
        });
    });

    test('Nested .ref() schemas serialize', () => {
        expect(
            objectSchema({ properties: { id: stringSchema().ref('#/external') } }).toJSON()
        ).to.deep.equal({
            type: 'object',
            properties: { id: { $ref: '#/external' } },
        });
    });

    suite('defineRecursive', () => {
        interface TreeNode {
            value: number;
            children: TreeNode[];
            parent?: TreeNode | null;
        }
        const tree = defineRecursive<TreeNode>('TreeNode', self =>
            objectSchema({
                properties: {
                    value: numberSchema(),
                    children: arraySchema(self),
                    parent: self.nullable().description('Parent'),
                },
                required: ['value', 'children'],
                additionalProperties: false,
            })
        );
        const treeJson = {
            type: 'object',
            properties: {
                value: { type: 'number' },
                children: { type: 'array', items: { $ref: '#/$defs/TreeNode' } },
                parent: {
                    description: 'Parent',
                    anyOf: [{ $ref: '#/$defs/TreeNode' }, { type: 'null' }],
                },
            },
            required: ['value', 'children'],
            additionalProperties: false,
        };

        test('References itself', () => {
            expect(tree.toJSON()).to.deep.equal({
                $ref: '#/$defs/TreeNode',
                $defs: { TreeNode: treeJson },
            });
            expectTypeOf<SchemaType<typeof tree>>().toEqualTypeOf<TreeNode>();
        });

        test('Validates nested values', () => {
            const validate = new Ajv2020({ strict: true }).compile(tree.toJSON());
            expect(
                validate({
                    value: 1,
                    children: [{ value: 2, children: [], parent: null }],
                })
            ).to.equal(true);
            expect(validate({ value: 1, children: [{ value: 2 }] })).to.equal(false);
        });

        test('Usable like any definition', () => {
            const forest = objectSchema({ properties: { trees: arraySchema(tree.nullable()) } });
            expect(forest.toJSON({ openApi30: true })).to.deep.equal({
                type: 'object',
                properties: {
                    trees: {
                        type: 'array',
                        items: {
                            nullable: true,
                            allOf: [{ $ref: '#/components/schemas/TreeNode' }],
                        },
                    },
                },
            });
            expect(components([forest], { openApi30: true })).to.have.deep.nested.property(
                'TreeNode.properties.parent',
                {
                    description: 'Parent',
                    nullable: true,
                    allOf: [{ $ref: '#/components/schemas/TreeNode' }],
                }
            );
            expect(() =>
                objectSchema({
                    properties: { a: tree, b: objectSchema().define('TreeNode') },
                }).toJSON()
            ).to.throw('Different schemas are defined with the same name: "TreeNode"');
        });

        test('Mutually recursive definitions', () => {
            interface Folder {
                files: File[];
            }
            interface File {
                folder: Folder;
            }
            const folder = defineRecursive<Folder>('Folder', self =>
                objectSchema({
                    properties: {
                        files: arraySchema(
                            defineRecursive<File>('File', () =>
                                objectSchema({ properties: { folder: self }, required: ['folder'] })
                            )
                        ),
                    },
                    required: ['files'],
                })
            );
            expect(folder.toJSON()).to.deep.equal({
                $ref: '#/$defs/Folder',
                $defs: {
                    Folder: {
                        type: 'object',
                        properties: { files: { type: 'array', items: { $ref: '#/$defs/File' } } },
                        required: ['files'],
                    },
                    File: {
                        type: 'object',
                        properties: { folder: { $ref: '#/$defs/Folder' } },
                        required: ['folder'],
                    },
                },
            });
        });

        test('The built schema must produce the declared type', () => {
            defineRecursive<TreeNode>('TreeNode', self =>
                // @ts-expect-error
                objectSchema({ properties: { value: stringSchema(), children: arraySchema(self) } })
            );
        });

        test('Only annotations and nullable apply to the reference', () => {
            defineRecursive<TreeNode>('TreeNode', self => {
                expect(self).to.be.an.instanceOf(RecursiveSchema);
                expectTypeOf<AvailableProperties<typeof self>>().toEqualTypeOf<
                    | '~standard'
                    | 'cast'
                    | 'default'
                    | 'deprecated'
                    | 'description'
                    | 'example'
                    | 'examples'
                    | 'nullable'
                    | 'readOnly'
                    | 'title'
                    | 'toJSON'
                    | 'writeOnly'
                >();
                return tree;
            });
        });
    });
});
