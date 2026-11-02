/**
 * One check of a generated type, as a single line of TypeScript. `Subject` is the generated type, and `Equals` is true
 * only for identical types, so `any` never passes it.
 */
export interface Probe {
    /**
     * What the probe is about, the row it is grouped under in the report.
     */
    readonly feature: string;
    /**
     * What it checks.
     */
    readonly description: string;
    /**
     * Whether the line must fail to type-check, for a value the schema doesn't allow.
     */
    readonly rejects: boolean;
    /**
     * The line of TypeScript.
     */
    readonly code: string;
}

const accepts = (
    feature: string,
    description: string,
    value: string,
    subject = 'Subject'
): Probe => ({
    feature,
    description: `accepts ${description}`,
    rejects: false,
    code: `(_: ${subject}) => _; const _accept: ${subject} = ${value};`,
});

const rejects = (
    feature: string,
    description: string,
    value: string,
    subject = 'Subject'
): Probe => ({
    feature,
    description: `rejects ${description}`,
    rejects: true,
    code: `(_: ${subject}) => _; const _reject: ${subject} = ${value};`,
});

const reads = (feature: string, description: string, code: string): Probe => ({
    feature,
    code,
    description: `reads ${description}`,
    rejects: false,
});

/**
 * Probes of a type generated from the `jsonSchema` document.
 */
export const jsonSchemaProbes: readonly Probe[] = [
    accepts('Nullable', 'a string', `{ nullable: 'a' }`),
    accepts('Nullable', 'null', `{ nullable: null }`),
    rejects('Nullable', 'a number', `{ nullable: 1 }`),

    accepts('Mixed enum', 'a string member', `{ mixed: 'a' }`),
    accepts('Mixed enum', 'a number member', `{ mixed: 42 }`),
    rejects('Mixed enum', 'another string', `{ mixed: 'b' }`),

    accepts('Tuple', 'two numbers', `{ point: [1, 2] }`),
    rejects('Tuple', 'one number', `{ point: [1] }`),
    rejects('Tuple', 'three numbers', `{ point: [1, 2, 3] }`),
    reads(
        'Tuple',
        'a member as a number',
        `const _read: Equals<NonNullable<Subject['point']>[0], number> = true;`
    ),

    accepts('oneOf objects', 'a branch', `{ shape: { kind: 'circle', radius: 1 } }`),
    rejects('oneOf objects', 'a branch without its property', `{ shape: { kind: 'circle' } }`),
    reads(
        'oneOf objects',
        'a property after narrowing',
        `(shape: Extract<NonNullable<Subject['shape']>, { kind: 'circle' }>) => { const _read: Equals<typeof shape.radius, number> = true; };`
    ),

    accepts('Recursion', 'a nested value', `{ tree: { value: 1, children: [{ value: 2 }] } }`),
    rejects(
        'Recursion',
        'a wrong value five levels down',
        `{ tree: { value: 1, children: [{ value: 1, children: [{ value: 1, children: [{ value: 1, children: [{ value: 'a' }] }] }] }] } }`
    ),
    reads(
        'Recursion',
        'a value five levels down as a number',
        `(tree: NonNullable<Subject['tree']>) => { const _read: Equals<typeof deep.value, number> = true; const deep = tree.children![0]!.children![0]!.children![0]!.children![0]!; };`
    ),

    accepts('Closed patternProperties', 'a matching key', `{ headers: { 'x-a': 'b' } }`),
    rejects('Closed patternProperties', 'another key', `{ headers: { other: 'b' } }`),

    accepts('Literal pattern', 'a matching string', `{ id: 'usr_1' }`),
    rejects('Literal pattern', 'another string', `{ id: 'org_1' }`),

    accepts('dependentRequired', 'both properties', `{ billing: { card: 'a', address: 'b' } }`),
    accepts('dependentRequired', 'the dependency alone', `{ billing: { address: 'b' } }`),
    rejects('dependentRequired', 'the dependent alone', `{ billing: { card: 'a' } }`),
];

const operation = "Subject['/notes/{id}']['put']";
const body = `${operation}['requestBody']['content']['application/json']`;
const response = `${operation}['responses'][200]['content']['application/json']`;

/**
 * Probes of a type generated from the `openApiDocument` document.
 */
export const openApiProbes: readonly Probe[] = [
    accepts('Request body', 'a valid body', `{ id: 'note_1' }`, body),
    rejects('Request body', 'a missing required property', `{}`, body),
    rejects('Request body', 'an unknown property', `{ id: 'note_1', other: 1 }`, body),

    reads(
        'Response',
        'a required property',
        `const _read: Equals<${response}['id'] extends string ? 1 : 0, 1> = true;`
    ),
    reads(
        'Response',
        'a tuple',
        `const _read: Equals<NonNullable<${response}['position']>, [number, number]> = true;`
    ),
    reads(
        'Response',
        'a mixed enum',
        `const _read: Equals<NonNullable<${response}['status']> | null, 'open' | 1 | null> = true;`
    ),

    accepts('Literal pattern', 'a matching string', `{ id: 'note_1' }`, body),
    rejects('Literal pattern', 'another string', `{ id: 'other' }`, body),

    reads(
        'Parameters',
        'a path parameter',
        `const _read: Equals<${operation}['parameters']['path']['id'], string> = true;`
    ),
    reads(
        'Parameters',
        'an optional query parameter',
        `const _read: Equals<NonNullable<NonNullable<${operation}['parameters']['query']>['dryRun']>, boolean> = true;`
    ),
];
