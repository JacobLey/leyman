import type { Scenario } from './scenarios.js';
import Path from 'node:path';
import {
    generateInterfaces,
    linkSchema,
    parseXml as tsXsdParse,
    parseXsd as tsXsdSchema,
} from '@abapify/ts-xsd';
// eslint-disable-next-line sonarjs/deprecation -- See its use below
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {
    parseXml as engineParse,
    parseXsd as engineSchema,
    generateTypeScript,
    validate,
    xmlToJson,
} from 'xml-xsd-engine';
import { parse } from 'xenever';
import { generate, loadXsd } from 'xenever/xsd';
import { handWritten } from './hand-written.js';

/**
 * A tool, set up for one scenario's schema.
 */
export interface Compiled {
    /**
     * Reads a document into the tool's value, throwing when the tool finds it invalid.
     */
    readonly parse: (xml: string) => unknown;
    /**
     * TypeScript source exporting `Subject`, the type the tool gives the parsed value.
     */
    readonly types: string;
}

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
     * Whether it reads an XSD. One that doesn't has nothing to run in a scenario about XSD features.
     */
    readonly readsXsd: boolean;
    /**
     * Module importing what the tool needs at runtime to parse a document, for the bundle size.
     */
    readonly runtime: string;
    /**
     * Sets the tool up for a scenario. Throwing is a result: every probe of the scenario fails.
     */
    readonly compile: (scenario: Scenario) => Compiled | Promise<Compiled>;
}

/**
 * An error for an invalid document a tool reported in a structure, rather than by throwing, with the location it gave.
 *
 * @param message - what the tool said
 * @param location - where it said the problem is
 * @returns the error to throw
 */
const invalidDocument = (
    message: string,
    location: {
        readonly line?: number | undefined;
        readonly column?: number | undefined;
        readonly path?: string | undefined;
    }
): Error => Object.assign(new Error(message), location);

/**
 * Reads the scenario's files, which hold every file its schemas refer to.
 *
 * @param files - XSD files by absolute path
 * @returns a reader of a file by path
 */
const readFrom =
    (files: Readonly<Record<string, string>>) =>
    (path: string): string =>
        files[path]!;

/**
 * The tool the comparison is about. The XSD is loaded with the scenario's options, and the types are what its codegen
 * prints.
 */
export const xeneverTool: Tool = {
    name: 'xenever',
    packageName: 'xenever',
    readsXsd: true,
    runtime: "export { parse, x } from 'xenever';",
    compile: async ({ schema, xenever }) => {
        const read = readFrom(schema.files);
        const set = await loadXsd(schema.entry, {
            readFile: async path => read(path),
            ...xenever,
        });
        const element = set.elements.find(({ name }) => name === schema.element)!;
        const { text } = generate(set);
        const declaration = new RegExp(
            String.raw`export const (\w+): x\.ElementSchema<"${schema.element}"`,
            'v'
        );
        const constName = declaration.exec(text)![1]!;
        return {
            parse: xml => parse(xml, element),
            types: `${text}\nexport type Subject = x.Infer<typeof ${constName}>;\n`,
        };
    },
};

/**
 * The other tools that read an XSD, and fast-xml-parser, the most used XML parser, with types written by hand.
 */
export const alternativeTools: readonly Tool[] = [
    {
        // Linked as its README says for imports, and typed with its interface codegen, whose root type is the shape
        // `parseXml` returns
        name: '@abapify/ts-xsd',
        packageName: '@abapify/ts-xsd',
        readsXsd: true,
        runtime: "export { parseXml } from '@abapify/ts-xsd';",
        compile: ({ schema }: Scenario): Compiled => {
            const read = readFrom(schema.files);
            const linked = linkSchema(tsXsdSchema(read(schema.entry)), {
                basePath: Path.dirname(schema.entry),
                loader: (location, basePath) => read(Path.resolve(basePath, location)),
                throwOnMissing: true,
            });
            return {
                parse: xml => tsXsdParse(linked, xml),
                types: generateInterfaces(linked, { rootTypeName: 'Subject' }).code,
            };
        },
    },
    {
        // Validated, then converted with its own `xmlToJson`. The options match what its TypeScript codegen prints:
        // attributes without a prefix, and numbers and booleans as such
        name: 'xml-xsd-engine',
        packageName: 'xml-xsd-engine',
        readsXsd: true,
        runtime: "export { parseXml, parseXsd, validate, xmlToJson } from 'xml-xsd-engine';",
        compile: ({ schema }: Scenario): Compiled => {
            const read = readFrom(schema.files);
            const model = engineSchema(read(schema.entry), location =>
                read(Path.resolve(Path.dirname(schema.entry), location))
            );
            const typeName = model.elements
                .values()
                .find(({ name }) => name === schema.element)!.typeName;
            const subject =
                typeName === null
                    ? schema.element.charAt(0).toUpperCase() + schema.element.slice(1)
                    : typeName.replace(/^\{[^\}]*\}/v, '');
            return {
                parse: xml => {
                    const document = engineParse(xml);
                    const { valid, issues } = validate(document, model);
                    if (!valid) {
                        // The first issue that has a line, if any does
                        const located =
                            issues.find(({ line }) => typeof line === 'number') ?? issues[0]!;
                        throw invalidDocument(issues.map(({ message }) => message).join('; '), {
                            line: located.line,
                            column: located.col,
                            path: located.path,
                        });
                    }
                    return xmlToJson(document, {
                        attributePrefix: '',
                        coerceNumbers: true,
                        coerceBooleans: true,
                    });
                },
                types: `${generateTypeScript(model)}\nexport type Subject = ${subject};\n`,
            };
        },
    },
    {
        // It reads no XSD: each scenario's options and types are written by hand, from the schema
        name: 'fast-xml-parser',
        packageName: 'fast-xml-parser',
        readsXsd: false,
        runtime: "export { XMLParser, XMLValidator } from 'fast-xml-parser';",
        compile: ({ id }: Scenario): Compiled => {
            const { options, types } = handWritten[id]!;
            const parser = new XMLParser(options);
            return {
                parse: xml => {
                    // Its validator checks only that the document is well-formed
                    // eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation -- What the version compared ships, without which it reads any document
                    const result = XMLValidator.validate(xml);
                    if (result !== true) {
                        const { msg, line, col } = result.err;
                        throw invalidDocument(msg, { line, column: col });
                    }
                    return parser.parse(xml) as unknown;
                },
                types,
            };
        },
    },
];
