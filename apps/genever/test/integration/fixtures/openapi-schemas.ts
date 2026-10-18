import {
    arraySchema,
    defineRecursive,
    enumSchema,
    numberSchema,
    objectSchema,
    stringSchema,
} from 'juniper';

/**
 * Juniper schemas assembled into OpenAPI documents with `components()`, whose types genever must generate
 * from the document, exactly as Juniper infers them.
 */

export const address = objectSchema({
    properties: { city: stringSchema(), zip: stringSchema().nullable() },
    required: ['city'],
}).define('Address');

export const user = objectSchema({
    properties: {
        id: stringSchema().startsWith('usr_'),
        home: address,
        work: address.nullable(),
        role: enumSchema().enums(['admin', 'member'] as const),
        tags: arraySchema(stringSchema()),
    },
    required: ['id', 'home'],
    additionalProperties: false,
}).define('User');

interface TreeNode {
    value: number;
    children: TreeNode[];
}
export const tree = defineRecursive<TreeNode>('TreeNode', self =>
    objectSchema({
        properties: { value: numberSchema(), children: arraySchema(self) },
        required: ['value', 'children'],
    })
);
