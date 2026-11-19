import { mkdir, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, x, XeneverUnsupportedError } from 'xenever';
import { generate } from 'xenever/xsd';
import * as names from '#test/generated/names.js';
import { loadSchema } from '#test/unit/xsd/helpers.js';

/**
 * Where generated modules are written to be imported: inside the package, so `xenever` resolves to it, and
 * ignored by Git, lint and the formatter.
 */
const tmpDirectory = Path.resolve(import.meta.dirname, '../../tmp');

/**
 * Generates TypeScript for an XSD and imports it (Node strips the types).
 *
 * @param fileName - written as `dist-test/tmp/<fileName>.ts`
 * @param body - the children of `xs:schema`
 * @returns the module's exports
 */
const importGenerated = async (
    fileName: string,
    body: string
): Promise<Readonly<Record<string, unknown>>> => {
    const filePath = Path.join(tmpDirectory, `${fileName}.ts`);
    await mkdir(tmpDirectory, { recursive: true });
    await writeFile(filePath, generate(await loadSchema(body)).text);
    return (await import(pathToFileURL(filePath).href)) as Readonly<Record<string, unknown>>;
};

suite('generate', () => {
    test('Names exports after the XSD names, suffixing collisions and reserved words in document order', () => {
        expect(Object.keys(names).toSorted((a, b) => a.localeCompare(b))).to.deep.equal(
            [
                'Catalog',
                'Default',
                'LineItem',
                'LineItem_2',
                'LineItem_3',
                'catalog',
                'class_2',
                'x_2',
            ].toSorted((a, b) => a.localeCompare(b))
        );
    });

    test('Turns XML names into identifiers', async () => {
        const generated = await importGenerated(
            'identifiers',
            ['USState', 'URL', 'purchase-order', 'a.b-c', '_x', '\u{483}a', '\u{E3F}', 'import']
                .map(name => `<xs:element name="${name}" type="xs:string"/>`)
                .join('')
        );
        expect(Object.keys(generated).toSorted((a, b) => a.localeCompare(b))).to.deep.equal(
            ['usState', 'url', 'purchaseOrder', 'abc', '_x', '_\u{483}a', '_', 'import_2'].toSorted(
                (a, b) => a.localeCompare(b)
            )
        );
    });

    test('Builds consts that parse', async () => {
        const generated = await importGenerated(
            'parse',
            '<xs:element name="greeting" type="xs:token"/>'
        );
        expect(parse('<greeting> hi </greeting>', generated.greeting as never)).to.equal('hi');
    });

    test('Builds a content model that allows no children', async () => {
        const filePath = Path.join(tmpDirectory, 'empty.ts');
        const type = x.complex({ content: x.choice([]) });
        await mkdir(tmpDirectory, { recursive: true });
        await writeFile(
            filePath,
            generate({ elements: [], types: [{ name: 'Empty', type }] }).text
        );
        const generated = (await import(pathToFileURL(filePath).href)) as Readonly<
            Record<string, unknown>
        >;
        expect(generated.Empty).to.deep.equal(type);
    });

    test('Builds the types an xsi:type may select, saying one by its key', async () => {
        const filePath = Path.join(tmpDirectory, 'types.ts');
        const base = x.complex({ name: 'Base', abstract: true });
        const keyed = x.complex({ name: 'Base', namespace: 'urn:other', key: 'Other' });
        const element = x.element('e', base, { types: () => [keyed] });
        const invalid = x.element('never', base);
        await mkdir(tmpDirectory, { recursive: true });
        await writeFile(
            filePath,
            generate({ elements: [element, invalid], types: [{ name: 'Base', type: base }] }).text
        );
        const generated = (await import(pathToFileURL(filePath).href)) as {
            readonly e: typeof element;
            readonly never: typeof invalid;
        };
        expect(generated.never).to.deep.equal(invalid);
        expect(generated.e.types()).to.deep.equal([keyed]);
        expect(
            parse(
                '<e xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:o="urn:other" xsi:type="o:Base"/>',
                generated.e
            )
        ).to.deep.equal({ type: 'Other', attributes: {} });
    });

    test('Builds the namespaces a QName default or fixed value uses', async () => {
        const set = await loadSchema(
            `<xs:element name="name" type="xs:QName" default="p:a" xmlns:p="urn:p"/>
            <xs:element name="names" fixed="b p:c" xmlns="urn:d" xmlns:p="urn:p">
                <xs:simpleType><xs:list itemType="xs:QName"/></xs:simpleType>
            </xs:element>`
        );
        const { text } = generate(set);
        expect(text).to.include('{ default: "p:a", namespaces: { p: "urn:p" } }');
        expect(text).to.include('namespaces: { "": "urn:d", p: "urn:p" }');
        const generated = await importGenerated(
            'qname-values',
            `<xs:element name="name" type="xs:QName" default="p:a" xmlns:p="urn:p"/>`
        );
        expect(generated.name).to.deep.equal(set.elements[0]);
        expect(parse('<name xmlns:p="urn:other"/>', generated.name as never)).to.deep.equal({
            namespace: 'urn:p',
            localName: 'a',
        });
    });

    test('Rejects an anonymous complex type that contains itself through a group', async () => {
        const set = await loadSchema(
            `<xs:group name="G"><xs:sequence>
                <xs:element name="e" minOccurs="0"><xs:complexType><xs:group ref="G"/></xs:complexType></xs:element>
            </xs:sequence></xs:group>
            <xs:element name="root"><xs:complexType><xs:group ref="G"/></xs:complexType></xs:element>`
        );
        expect(() => generate(set)).to.throw(
            XeneverUnsupportedError,
            /^An anonymous complex type that contains itself/v
        );
    });
});
