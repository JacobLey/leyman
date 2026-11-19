import type { LoadXsdOptions } from 'xenever/xsd';

/**
 * An XSD whose generated TypeScript is committed under `test/generated/`, where the test type check reads it.
 */
export interface CodegenFixture {
    /**
     * Name of the generated file, `test/generated/<name>.ts`.
     */
    readonly name: string;
    /**
     * Path of the XSD, from the package root.
     */
    readonly xsd: string;
    /**
     * Options it is loaded with.
     */
    readonly options: LoadXsdOptions;
}

export const codegenFixtures: readonly CodegenFixture[] = [
    { name: 'order', xsd: 'test/data/codegen/order.xsd', options: {} },
    { name: 'content', xsd: 'test/data/codegen/content.xsd', options: {} },
    { name: 'tree', xsd: 'test/data/codegen/tree.xsd', options: {} },
    {
        name: 'names',
        xsd: 'test/data/codegen/names.xsd',
        options: { bigint: true, ordered: ['{urn:example:names}line-item'] },
    },
    { name: 'pom', xsd: 'test/data/pom/maven-4.0.0.xsd', options: {} },
    { name: 'registry', xsd: 'test/data/codegen/registry.xsd', options: {} },
];
