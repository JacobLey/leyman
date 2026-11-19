import type { x } from 'xenever';
import type { XsdSchemaSet } from 'xenever/xsd';
import { readFile } from 'node:fs/promises';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, XeneverValidationError } from 'xenever';
import { loadXsd } from 'xenever/xsd';
import * as content from '#test/generated/content.js';
import * as names from '#test/generated/names.js';
import * as order from '#test/generated/order.js';
import * as pom from '#test/generated/pom.js';
import * as registry from '#test/generated/registry.js';
import * as tree from '#test/generated/tree.js';
import { codegenFixtures } from './fixtures.js';

/**
 * Loads a fixture's XSD as the generator read it.
 *
 * @param name - `name` of one of the `codegenFixtures`
 * @returns the schema set
 */
const loadFixture = async (name: string): Promise<XsdSchemaSet> => {
    const fixture = codegenFixtures.find(candidate => candidate.name === name)!;
    return loadXsd(fixture.xsd, fixture.options);
};

/**
 * Copies a value of the IR with each wildcard's `declarations` getter replaced by the names of what it returns,
 * which a deep equality can compare.
 *
 * @param value - a value of the IR
 * @returns the copy
 */
const resolved = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(item => resolved(item));
    }
    if (typeof value !== 'object' || value === null) {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            key === 'declarations'
                ? (item as () => readonly x.Attribute[] | readonly x.Element[])().map(
                      declaration => [declaration.namespace, declaration.name]
                  )
                : resolved(item),
        ])
    );
};

/**
 * Asserts a document parses the same with a generated element const as with the loaded declaration.
 *
 * @param fixture - name of the fixture
 * @param generated - the generated const
 * @param document - path of the document
 */
const expectSameParse = async (
    fixture: string,
    generated: x.Element,
    document: string
): Promise<void> => {
    const set = await loadFixture(fixture);
    const loaded = set.elements.find(element => element.name === generated.name)!;
    const xml = await readFile(document, 'utf8');
    expect(parse(xml, generated)).to.deep.equal(parse(xml, loaded));
};

suite('Generated consts', () => {
    test('Parse the order as the loaded schema does', async () => {
        await expectSameParse('order', order.purchaseOrder, 'test/data/codegen/order.xml');
    });

    test('Parse content models as the loaded schema does', async () => {
        await expectSameParse('content', content.content, 'test/data/codegen/content.xml');
    });

    test('Parse names that collide as the loaded schema does', async () => {
        await expectSameParse('names', names.catalog, 'test/data/codegen/names.xml');
    });

    test('Parse the POM as the loaded schema does', async () => {
        await expectSameParse('pom', pom.project, 'test/data/pom/pom.xml');
    });

    test('Parse recursion through a named type as the loaded schema does', async () => {
        await expectSameParse('tree', tree.tree, 'test/data/codegen/tree.xml');
    });

    test('Parse recursion through a global element as the loaded schema does', async () => {
        await expectSameParse('tree', tree.outline, 'test/data/codegen/outline.xml');
    });

    test('Parse identity constraints as the loaded schema does', async () => {
        await expectSameParse('registry', registry.registry, 'test/data/codegen/registry.xml');
    });

    test('Reject a broken identity constraint as the loaded schema does', async () => {
        const [set, xml] = await Promise.all([
            loadFixture('registry'),
            readFile('test/data/codegen/registry.xml', 'utf8'),
        ]);
        const broken = xml.replace('plate="456"', 'plate="457"');
        const reason =
            /^Element `car` has values \("CA", "457"\) that match nothing of `registration`/v;
        expect(() => parse(broken, registry.registry)).to.throw(XeneverValidationError, reason);
        expect(() => parse(broken, set.elements[0]!)).to.throw(XeneverValidationError, reason);
    });

    test('Build the same schema values as the loader, without recursion', async () => {
        const [orderSet, contentSet, namesSet, pomSet, registrySet] = await Promise.all(
            ['order', 'content', 'names', 'pom', 'registry'].map(async name => loadFixture(name))
        );
        expect(
            resolved([registry.registry, registry.state, registry.vehicle, registry.person])
        ).to.deep.equal(resolved(registrySet!.elements));
        expect(resolved([content.anything, content.content])).to.deep.equal(
            resolved(contentSet!.elements)
        );
        expect(resolved([order.purchaseOrder, order.comment])).to.deep.equal(
            resolved(orderSet!.elements)
        );
        expect(resolved([names.catalog, names.class_2, names.x_2])).to.deep.equal(
            resolved(namesSet!.elements)
        );
        expect(resolved([pom.project])).to.deep.equal(resolved(pomSet!.elements));
    });
});
