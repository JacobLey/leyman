import type { TsDoc, TsIndex, TsType } from './ts-type.js';

const indentWidth = 4;
const indentUnit = ' '.repeat(indentWidth);

const identifier = /^[$A-Z_a-z][\w$]*$/v;

/**
 * Binding strength of a printed type, so members are wrapped in parentheses when needed.
 * e.g. a union inside an array must be printed as `(A | B)[]`.
 */
const precedence = {
    union: 0,
    intersection: 1,
    primary: 2,
} as const;
type Precedence = (typeof precedence)[keyof typeof precedence];

type PrintType = (type: TsType, indent: string, minimum?: Precedence) => string;

/**
 * Print documentation as a JSDoc comment.
 *
 * @param doc - documentation, if any
 * @param indent - indentation of the documented line
 * @returns JSDoc comment followed by a newline and indentation, or empty if there is nothing to document
 */
export const printDoc = (doc: TsDoc | null, indent: string): string => {
    if (!doc) {
        return '';
    }
    const paragraphs = [doc.title, doc.description].filter(text => text !== null);
    const tags = [
        ...doc.tags.map(tag => `@${tag.name} ${tag.text}`),
        ...(doc.deprecated ? ['@deprecated'] : []),
    ];
    const lines = [
        ...paragraphs.flatMap((text, i) => [...(i > 0 ? [''] : []), ...text.split('\n')]),
        // A blank line between the description and its tags
        ...(paragraphs.length > 0 && tags.length > 0 ? [''] : []),
        ...tags,
    ];
    const body = lines
        .map(line => {
            // `*/` would end the comment early
            const escaped = line.replaceAll('*/', String.raw`*\/`);
            return line ? `${indent} * ${escaped}` : `${indent} *`;
        })
        .join('\n');
    return `/**\n${body}\n${indent} */\n${indent}`;
};

const printPropertyName = (name: string): string =>
    identifier.test(name) ? name : JSON.stringify(name);

const escapeTemplateText = (text: string): string =>
    text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');

/**
 * Index signatures whose value is not `unknown` are printed as separate objects, intersected with the properties.
 * Within one object, TypeScript would require every property to match the index signature,
 * which a schema does not (e.g. `properties` alongside a different `additionalProperties`).
 *
 * @param type - object with properties and index signatures
 * @returns object types to intersect
 */
const splitObject = (type: TsType & { kind: 'object' }): (TsType & { kind: 'object' })[] => {
    const inline = type.index.filter(
        index => index.value.kind === 'keyword' && index.value.keyword === 'unknown'
    );
    const separate = type.index.filter(index => !inline.includes(index));
    if (
        separate.length === 0 ||
        (type.properties.length === 0 && separate.length === 1 && inline.length === 0)
    ) {
        return [type];
    }
    return [
        ...(type.properties.length > 0 || inline.length > 0
            ? [{ kind: 'object' as const, properties: type.properties, index: inline }]
            : []),
        ...separate.map(index => ({ kind: 'object' as const, properties: [], index: [index] })),
    ];
};

const precedenceOf = (type: TsType): Precedence => {
    if (type.kind === 'union') {
        return precedence.union;
    }
    return type.kind === 'intersection' || (type.kind === 'object' && splitObject(type).length > 1)
        ? precedence.intersection
        : precedence.primary;
};

const printObject = (
    type: TsType & { kind: 'object' },
    indent: string,
    print: PrintType
): string => {
    const inner = indent + indentUnit;
    const printIndex = (index: TsIndex): string =>
        `[key: ${print(index.key, inner)}]: ${print(index.value, inner)};`;
    const lines = [
        ...type.properties.map(property => {
            const name = printPropertyName(property.name) + (property.optional ? '?' : '');
            return `${inner}${printDoc(property.doc, inner)}${name}: ${print(property.type, inner)};`;
        }),
        ...type.index.map(index => inner + printIndex(index)),
    ];
    return lines.length > 0 ? `{\n${lines.join('\n')}\n${indent}}` : '{}';
};

/**
 * Print each kind of type, without parentheses. Nested types are printed with `print`.
 */
const printers: {
    [Kind in TsType['kind']]: (
        type: TsType & { kind: Kind },
        indent: string,
        print: PrintType
    ) => string;
} = {
    keyword: type => (type.keyword === 'object' ? 'Record<string, unknown>' : type.keyword),
    literal: type => JSON.stringify(type.value),
    reference: type => type.name,
    template: type => {
        const parts = type.parts.map(part =>
            part.kind === 'string' ? `\${string}` : escapeTemplateText(part.text)
        );
        return `\`${parts.join('')}\``;
    },
    array: (type, indent, print) => `${print(type.element, indent, precedence.primary)}[]`,
    tuple: (type, indent, print) => {
        const elements = type.elements.map(element =>
            element.optional
                ? `${print(element.type, indent, precedence.primary)}?`
                : print(element.type, indent)
        );
        if (type.rest) {
            elements.push(`...${print(type.rest, indent, precedence.primary)}[]`);
        }
        return `[${elements.join(', ')}]`;
    },
    object: (type, indent, print) =>
        splitObject(type)
            .map(object => printObject(object, indent, print))
            .join(' & '),
    union: (type, indent, print) =>
        type.members.map(member => print(member, indent, precedence.intersection)).join(' | '),
    intersection: (type, indent, print) =>
        type.members.map(member => print(member, indent, precedence.intersection)).join(' & '),
};

/**
 * Print a type as TypeScript source.
 *
 * @param type - type to print
 * @param indent - indentation of the line the type starts on
 * @param minimum - parenthesize the type if it binds weaker than this
 * @returns TypeScript source of the type
 */
export const printType = (
    type: TsType,
    indent = '',
    minimum: Precedence = precedence.union
): string => {
    // Each printer only accepts its own kind, which `type.kind` guarantees
    const printer = printers[type.kind] as (
        type: TsType,
        indent: string,
        print: PrintType
    ) => string;
    const printed = printer(type, indent, printType);
    return precedenceOf(type) < minimum ? `(${printed})` : printed;
};
