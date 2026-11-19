import type { x } from 'xenever';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, XeneverUnsupportedError, XeneverValidationError } from 'xenever';
import { expectSchemaError, loadFiles, loadSchema, mainPath, schema } from './helpers.js';

const tns = 'targetNamespace="urn:t" xmlns:t="urn:t"';
const xsi = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';

/**
 * Defines a complex type, empty or derived from another without adding anything.
 *
 * @param name - its name
 * @param base - the type it derives from, as `extension:Base` or `restriction:Base`
 * @param attributes - more attributes of `xs:complexType`
 * @returns the `xs:complexType`
 */
const type = (name: string, base?: string, attributes = ''): string => {
    if (base === undefined) {
        return `<xs:complexType name="${name}" ${attributes}/>`;
    }
    const [method, baseName] = base.split(':', 2) as [string, string];
    return `<xs:complexType name="${name}" ${attributes}><xs:complexContent><xs:${method} base="t:${baseName}"/></xs:complexContent></xs:complexType>`;
};

/**
 * Names the types an `xsi:type` may select for an element.
 *
 * @param element - an element declaration
 * @returns their names, `null` when it has no `types`
 */
const typesOf = (element: x.Element): readonly (string | undefined)[] | null =>
    element.types?.().map(({ name }) => name) ?? null;

suite('loadXsd polymorphism', () => {
    suite('Named and abstract types', () => {
        test('Names each global complex type, with its target namespace', async () => {
            const { types, elements } = await loadSchema(
                `${type('Base')}<xs:element name="e"><xs:complexType/></xs:element>`,
                tns
            );
            expect(types[0]!.type).to.deep.equal({
                kind: 'complex',
                name: 'Base',
                namespace: 'urn:t',
            });
            expect(elements[0]!.type).to.deep.equal({ kind: 'complex' });
        });

        test('Names a type without a target namespace by its local name only', async () => {
            const { types } = await loadSchema('<xs:complexType name="Base"/>');
            expect(types[0]!.type).to.deep.equal({ kind: 'complex', name: 'Base' });
        });

        test('Marks an abstract type', async () => {
            const { types } = await loadSchema(
                `${type('Base', undefined, 'abstract="true"')}
                <xs:complexType name="Text" abstract="1"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType>
                ${type('Derived', 'extension:Base', 'abstract="true"')}
                ${type('Concrete', 'extension:Base', 'abstract="false"')}`,
                tns
            );
            expect(types.map(named => (named.type as x.ComplexType).abstract)).to.deep.equal([
                true,
                true,
                true,
                undefined,
            ]);
            expect(types[1]!.type).to.deep.equal({
                kind: 'complex',
                name: 'Text',
                namespace: 'urn:t',
                abstract: true,
                text: { kind: 'string' },
            });
        });
    });

    suite('Types an xsi:type may select', () => {
        const family = `${type('Later', 'extension:Derived')}
            ${type('Base')}
            ${type('Derived', 'extension:Base')}
            ${type('Narrow', 'restriction:Derived')}
            ${type('Hidden', 'extension:Base', 'abstract="true"')}
            ${type('Shown', 'restriction:Hidden')}
            ${type('Other')}`;

        test('Lists the types derived from the type of an element, in document order, but abstract ones', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="e" type="t:Base"/>${family}<xs:element name="d" type="t:Derived"/>`,
                tns
            );
            expect(typesOf(elements[0]!)).to.deep.equal(['Later', 'Derived', 'Narrow', 'Shown']);
            expect(typesOf(elements[1]!)).to.deep.equal(['Later', 'Narrow']);
        });

        test('Gives no types to an element whose type nothing derives from', async () => {
            const { elements } = await loadSchema(
                `${family}
                <xs:element name="other" type="t:Other"/>
                <xs:element name="later" type="t:Later"/>
                <xs:element name="text" type="xs:string"/>
                <xs:element name="anything"/>
                <xs:element name="anonymous"><xs:complexType/></xs:element>`,
                tns
            );
            expect(elements.map(element => typesOf(element))).to.deep.equal([
                null,
                null,
                null,
                null,
                null,
            ]);
        });

        suite('unsafeIgnoreDerivedTypes', () => {
            const ignoring = async (): Promise<x.Element> => {
                const { elements } = await loadSchema(
                    `<xs:element name="e" type="t:Base"/>${family}`,
                    tns,
                    { unsafeIgnoreDerivedTypes: true }
                );
                return elements[0]!;
            };

            test('Gives no element types, so values have no type', async () => {
                const element = await ignoring();
                expect(typesOf(element)).to.equal(null);
                expect(parse('<t:e xmlns:t="urn:t"/>', element)).to.deep.equal({ attributes: {} });
            });

            test('Lets an xsi:type name only the declared type', async () => {
                const element = await ignoring();
                const document = (name: string): string =>
                    `<t:e ${xsi} xmlns:t="urn:t" xsi:type="t:${name}"/>`;
                expect(parse(document('Base'), element)).to.deep.equal({ attributes: {} });
                expect(() => parse(document('Derived'), element)).to.throw(
                    XeneverValidationError,
                    /^`xsi:type` names `Derived` in `urn:t`, which is not a type `t:e` may have/v
                );
            });

            test('Keeps the names of types', async () => {
                const { types } = await loadSchema(type('Base'), tns, {
                    unsafeIgnoreDerivedTypes: true,
                });
                expect(types[0]!.type).to.deep.equal({
                    kind: 'complex',
                    name: 'Base',
                    namespace: 'urn:t',
                });
            });
        });

        test('Leaves out types derived by a method the element blocks', async () => {
            const { elements } = await loadSchema(
                `${family}
                <xs:element name="a" type="t:Base" block="restriction"/>
                <xs:element name="b" type="t:Base" block="extension"/>
                <xs:element name="c" type="t:Base" block="#all"/>
                <xs:element name="d" type="t:Derived" block="extension substitution"/>`,
                tns
            );
            expect(elements.map(element => typesOf(element))).to.deep.equal([
                ['Later', 'Derived'],
                null,
                null,
                ['Narrow'],
            ]);
        });

        test('Leaves out types derived by a method the type of the element blocks, but not one a type between them does', async () => {
            const blocking = family
                .replace('name="Base" ', 'name="Base" block="restriction"')
                .replace('name="Derived" ', 'name="Derived" block="extension"');
            const { elements } = await loadSchema(
                `${blocking}<xs:element name="e" type="t:Base"/><xs:element name="d" type="t:Derived"/>`,
                tns
            );
            expect(typesOf(elements[0]!)).to.deep.equal(['Later', 'Derived']);
            expect(typesOf(elements[1]!)).to.deep.equal(['Narrow']);
        });

        test('Takes the block of elements and types from blockDefault', async () => {
            const { elements } = await loadSchema(
                `${family}<xs:element name="e" type="t:Base"/><xs:element name="open" type="t:Base" block=""/>`,
                `${tns} blockDefault="extension substitution"`
            );
            expect(typesOf(elements[0]!)).to.equal(null);
            // The type's own block still comes from the default.
            expect(typesOf(elements[1]!)).to.equal(null);
        });

        test('Gives a local element its own block, and a reference that of its declaration', async () => {
            const { elements } = await loadSchema(
                `${family}
                <xs:element name="global" type="t:Base" block="extension"/>
                <xs:element name="root"><xs:complexType><xs:sequence>
                    <xs:element name="open" type="t:Derived"/>
                    <xs:element name="closed" type="t:Derived" block="restriction"/>
                    <xs:element ref="t:global" minOccurs="0"/>
                </xs:sequence></xs:complexType></xs:element>`,
                tns
            );
            const [open, closed, reference] = (elements[1]!.type as x.ComplexType).content!
                .particles as x.Element[];
            expect(typesOf(open!)).to.deep.equal(['Later', 'Narrow']);
            expect(typesOf(closed!)).to.deep.equal(['Later']);
            expect(typesOf(reference!)).to.equal(null);
        });

        test('Shares one getter among declarations of one type and block, so one name may be declared twice', async () => {
            const { elements } = await loadSchema(
                `${family}
                <xs:element name="global" type="t:Base"/>
                <xs:element name="root"><xs:complexType><xs:sequence>
                    <xs:element name="item" type="t:Base"/>
                    <xs:element ref="t:global" maxOccurs="2"/>
                    <xs:element name="item" type="t:Base"/>
                    <xs:element ref="t:global"/>
                </xs:sequence></xs:complexType></xs:element>`,
                tns
            );
            const [first, copy, second, global] = (elements[1]!.type as x.ComplexType).content!
                .particles as x.Element[];
            expect(first!.types).to.equal(second!.types);
            expect(copy!.types).to.equal(global!.types);
            expect(global).to.equal(elements[0]);
            expect(
                parse(
                    `<t:root ${xsi} xmlns:t="urn:t"><item xsi:type="t:Derived"/><t:global/><item/><t:global/></t:root>`,
                    elements[1]!
                )
            ).to.deep.equal({
                attributes: {},
                children: {
                    item: [
                        { type: 'Derived', attributes: {} },
                        { type: 'Base', attributes: {} },
                    ],
                    global: [
                        { type: 'Base', attributes: {} },
                        { type: 'Base', attributes: {} },
                    ],
                },
            });
        });

        test('Follows a type with simple content to the types that restrict it', async () => {
            const { elements } = await loadSchema(
                `<xs:complexType name="Money"><xs:simpleContent><xs:extension base="xs:decimal">
                    <xs:attribute name="currency" type="xs:string"/>
                </xs:extension></xs:simpleContent></xs:complexType>
                <xs:complexType name="Small"><xs:simpleContent><xs:restriction base="t:Money">
                    <xs:maxInclusive value="10"/>
                </xs:restriction></xs:simpleContent></xs:complexType>
                <xs:element name="price" type="t:Money" default="1.50"/>`,
                tns
            );
            const [price] = elements;
            expect(typesOf(price!)).to.deep.equal(['Small']);
            const document = (text: string): string =>
                `<t:price ${xsi} xmlns:t="urn:t" xsi:type="t:Small">${text}</t:price>`;
            expect(parse(document('2.50'), price!)).to.deep.equal({
                type: 'Small',
                attributes: {},
                text: '2.5',
            });
            expect(parse(document(''), price!)).to.include({ type: 'Small', text: '1.5' });
            expect(() => parse(document('11'), price!)).to.throw(XeneverValidationError);
        });

        test('Compares a fixed value, and fills in an empty element, as the type selected reads it', async () => {
            const { elements } = await loadSchema(
                `<xs:complexType name="T1"><xs:simpleContent><xs:extension base="xs:decimal"/></xs:simpleContent></xs:complexType>
                <xs:complexType name="T2"><xs:simpleContent><xs:restriction base="t:T1">
                    <xs:simpleType><xs:restriction base="xs:integer"/></xs:simpleType>
                </xs:restriction></xs:simpleContent></xs:complexType>
                <xs:element name="v" type="t:T1" fixed="1"/>`,
                tns
            );
            const [v] = elements;
            const document = (text: string): string =>
                `<t:v ${xsi} xmlns:t="urn:t" xsi:type="t:T2">${text}</t:v>`;
            expect(parse(document('1'), v!)).to.deep.equal({
                type: 'T2',
                attributes: {},
                text: 1,
            });
            expect(parse(document(''), v!)).to.include({ type: 'T2', text: 1 });
            expect(() => parse(document('2'), v!)).to.throw(
                XeneverValidationError,
                /^Element `t:v` must be "1"/v
            );
        });

        test('Lets a recursive type be selected where its base is declared', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="node" type="t:Node"/>
                ${type('Node')}
                <xs:complexType name="Tree"><xs:complexContent><xs:extension base="t:Node">
                    <xs:sequence><xs:element name="child" type="t:Node" minOccurs="0" maxOccurs="unbounded"/></xs:sequence>
                </xs:extension></xs:complexContent></xs:complexType>`,
                tns
            );
            expect(
                parse(
                    `<t:node ${xsi} xmlns:t="urn:t" xsi:type="t:Tree"><child xsi:type="t:Tree"><child/></child></t:node>`,
                    elements[0]!
                )
            ).to.deep.equal({
                type: 'Tree',
                attributes: {},
                children: {
                    child: [
                        {
                            type: 'Tree',
                            attributes: {},
                            children: { child: [{ type: 'Node', attributes: {} }] },
                        },
                    ],
                },
            });
        });

        test('Needs an xsi:type for an element of an abstract type', async () => {
            const { elements } = await loadSchema(
                `${type('Base', undefined, 'abstract="true"')}${type('Derived', 'extension:Base')}
                <xs:element name="e" type="t:Base"/>
                ${type('Alone', undefined, 'abstract="true"')}<xs:element name="never" type="t:Alone"/>`,
                tns
            );
            const [element, never] = elements;
            expect(
                parse(`<t:e ${xsi} xmlns:t="urn:t" xsi:type="t:Derived"/>`, element!)
            ).to.deep.equal({ type: 'Derived', attributes: {} });
            expect(() => parse('<t:e xmlns:t="urn:t"/>', element!)).to.throw(
                XeneverValidationError,
                /^The type of `t:e` is abstract/v
            );
            expect(typesOf(never!)).to.equal(null);
            expect(() => parse('<t:never xmlns:t="urn:t"/>', never!)).to.throw(
                XeneverValidationError,
                /^The type of `t:never` is abstract/v
            );
        });

        test('Rejects an xsi:type on an element of a simple type or of xs:anyType as unsupported', async () => {
            const { elements } = await loadSchema(
                '<xs:element name="text" type="xs:string"/><xs:element name="anything"/>'
            );
            const xs = 'xmlns:xs="http://www.w3.org/2001/XMLSchema"';
            expect(() =>
                parse(`<text ${xsi} ${xs} xsi:type="xs:string">a</text>`, elements[0]!)
            ).to.throw(XeneverUnsupportedError, /^`xsi:type` on an element of a simple type/v);
            expect(() =>
                parse(`<anything ${xsi} ${xs} xsi:type="xs:string">a</anything>`, elements[1]!)
            ).to.throw(XeneverUnsupportedError, /^`xsi:type` on an element of `xs:anyType`/v);
            expect(
                parse(`<anything ${xsi} ${xs} xsi:type="xs:anyType">a</anything>`, elements[1]!)
            ).to.have.property('children');
        });

        test('Reports types of one element whose names differ only by namespace as a limit', async () => {
            await expectSchemaError(
                loadFiles({
                    [mainPath]: schema(
                        `<xs:import namespace="urn:o" schemaLocation="other.xsd"/>
                        ${type('Base')}${type('Derived', 'extension:Base')}
                        <xs:element name="e" type="t:Base"/>`,
                        tns
                    ),
                    '/schemas/other.xsd': schema(
                        `<xs:import namespace="urn:t" schemaLocation="main.xsd"/>
                        ${type('Derived', 'restriction:Base')}`,
                        'targetNamespace="urn:o" xmlns:t="urn:t"'
                    ),
                }),
                XeneverUnsupportedError,
                /^Type key `Derived` is used by two types of one element.*no way to give them separate keys/v,
                { filePath: '/schemas/other.xsd', line: 2 }
            );
        });
    });
});
