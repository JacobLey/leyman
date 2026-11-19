import type { x } from 'xenever';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, XeneverValidationError } from 'xenever';
import { loadSchema, withoutDeclarations } from './helpers.js';

const tns = 'targetNamespace="urn:t" xmlns:t="urn:t"';

suite('loadXsd elements and attributes', () => {
    suite('Global elements', () => {
        test('Takes the target namespace, a named simple type, nillable and a default', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="price" type="t:Price" nillable="true" default="1.5"/>
                <xs:simpleType name="Price"><xs:restriction base="xs:decimal"/></xs:simpleType>`,
                tns
            );
            expect(elements).to.have.length(1);
            expect(elements[0]).to.deep.include({
                kind: 'element',
                name: 'price',
                namespace: 'urn:t',
                type: { kind: 'decimal' },
                nillable: true,
                default: '1.5',
            });
            expect(parse('<price xmlns="urn:t">2.25</price>', elements[0]!)).to.equal('2.25');
            expect(parse('<price xmlns="urn:t"></price>', elements[0]!)).to.equal('1.5');
        });

        test('Takes a fixed value, and no namespace without a target namespace', async () => {
            const { elements } = await loadSchema(
                '<xs:element name="version" type="xs:string" fixed="4.0.0"/>'
            );
            expect(elements[0]).to.deep.equal({
                ...elements[0],
                kind: 'element',
                name: 'version',
                type: { kind: 'string' },
                fixed: '4.0.0',
            });
            expect(elements[0]).not.to.have.property('namespace');
        });

        test('Takes a default of mixed content, which an empty element reads as', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="note" default="none">
                    <xs:complexType mixed="true">
                        <xs:sequence><xs:element name="b" type="xs:string" minOccurs="0"/></xs:sequence>
                    </xs:complexType>
                </xs:element>`
            );
            expect(elements[0]).to.deep.include({ default: 'none' });
            expect(parse('<note/>', elements[0]!)).to.deep.equal({
                attributes: {},
                children: [{ name: '#text', value: 'none' }],
            });
        });

        test('Implements Standard Schema', async () => {
            const { elements } = await loadSchema('<xs:element name="n" type="xs:int"/>');
            const result = await elements[0]!['~standard'].validate('<n>4</n>');
            expect(result).to.deep.equal({ value: 4 });
        });

        test('Is of xs:anyType without a type', async () => {
            const { elements } = await loadSchema('<xs:element name="anything"/>');
            expect(withoutDeclarations(elements[0]!.type)).to.deep.equal({
                kind: 'complex',
                name: 'anyType',
                namespace: 'http://www.w3.org/2001/XMLSchema',
                mixed: true,
                attributes: [{ kind: 'anyAttribute', processContents: 'lax' }],
                content: {
                    kind: 'sequence',
                    particles: [
                        {
                            kind: 'any',
                            processContents: 'lax',
                            minOccurs: 0,
                            maxOccurs: 'unbounded',
                        },
                    ],
                },
            });
            const value = parse('<anything a="1">text<b/></anything>', elements[0]!) as {
                readonly attributes: Readonly<Record<string, unknown>>;
            };
            expect(value.attributes).to.have.property('#any');
        });

        test('Uses one xs:anyType object per load', async () => {
            const { elements } = await loadSchema(
                '<xs:element name="a"/><xs:element name="b" type="xs:anyType"/>'
            );
            expect(elements[0]!.type).to.equal(elements[1]!.type);
            const other = await loadSchema('<xs:element name="a"/>');
            expect(other.elements[0]!.type).not.to.equal(elements[0]!.type);
        });

        test('Accepts block and final, and annotations anywhere', async () => {
            const { elements } = await loadSchema(
                `<xs:annotation><xs:documentation>Doc <b>bold</b></xs:documentation><xs:appinfo source="x"/></xs:annotation>
                <xs:element name="a" type="xs:string" block="#all" final="extension restriction" abstract="false">
                    <xs:annotation><xs:documentation/></xs:annotation>
                </xs:element>`
            );
            expect(elements.map(({ name }) => name)).to.deep.equal(['a']);
        });

        test('Derives from types that are final only for other derivations', async () => {
            const { types } = await loadSchema(
                `<xs:simpleType name="S" final="list union"><xs:restriction base="xs:string"/></xs:simpleType>
                <xs:simpleType name="R"><xs:restriction base="S"/></xs:simpleType>
                <xs:complexType name="Text"><xs:simpleContent><xs:extension base="S"/></xs:simpleContent></xs:complexType>
                <xs:complexType name="Open" final=""/>
                <xs:complexType name="Wider"><xs:complexContent><xs:extension base="Open"/></xs:complexContent></xs:complexType>`,
                'finalDefault="#all"'
            );
            expect(types.map(({ name }) => name)).to.deep.equal([
                'S',
                'R',
                'Text',
                'Open',
                'Wider',
            ]);
        });

        test('Keeps a fixed attribute in a restriction that writes the same value differently', async () => {
            const { types } = await loadSchema(
                `<xs:simpleType name="Ints"><xs:list itemType="xs:int"/></xs:simpleType>
                <xs:complexType name="Base">
                    <xs:attribute name="list" type="Ints" fixed="1   2 3"/>
                    <xs:attribute name="int" type="xs:int" fixed=" -1"/>
                    <xs:attribute name="at" type="xs:dateTime" fixed="2026-11-12T00:00:00Z"/>
                </xs:complexType>
                <xs:complexType name="Derived"><xs:complexContent><xs:restriction base="Base">
                    <xs:attribute name="list" type="Ints" fixed="1 2  3"/>
                    <xs:attribute name="int" type="xs:int" fixed="-01"/>
                    <xs:attribute name="at" type="xs:dateTime" fixed="2026-11-11T24:00:00+00:00"/>
                </xs:restriction></xs:complexContent></xs:complexType>
                <xs:complexType name="Text"><xs:simpleContent><xs:extension base="xs:string">
                    <xs:attribute name="on" type="xs:boolean" fixed="1"/>
                </xs:extension></xs:simpleContent></xs:complexType>
                <xs:complexType name="Short"><xs:simpleContent><xs:restriction base="Text">
                    <xs:maxLength value="3"/>
                    <xs:attribute name="on" type="xs:boolean" fixed="true"/>
                </xs:restriction></xs:simpleContent></xs:complexType>`
            );
            expect(types.map(({ name }) => name)).to.deep.equal([
                'Ints',
                'Base',
                'Derived',
                'Text',
                'Short',
            ]);
        });

        test('Records the prefixes a QName default or fixed value uses, from its scope', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="names" fixed=" t:a b  p:c" xmlns="urn:d" xmlns:p="urn:p" xmlns:u="urn:u">
                    <xs:simpleType><xs:list itemType="xs:QName"/></xs:simpleType>
                </xs:element>
                <xs:element name="plain" type="xs:string" default="t:a"/>
                <xs:element name="text" type="t:Text" fixed="t:x"/>
                <xs:complexType name="Text"><xs:simpleContent><xs:extension base="xs:QName">
                    <xs:attribute name="kind" type="xs:QName" default="kind"/>
                    <xs:attribute name="either" default="t:u">
                        <xs:simpleType><xs:union memberTypes="xs:int xs:QName"/></xs:simpleType>
                    </xs:attribute>
                </xs:extension></xs:simpleContent></xs:complexType>
                <xs:element name="list"><xs:complexType><xs:sequence>
                    <xs:element ref="t:names" minOccurs="0"/>
                </xs:sequence></xs:complexType></xs:element>`,
                tns
            );
            const [names, plain, text, list] = elements;
            const namespaces = { t: 'urn:t', '': 'urn:d', p: 'urn:p' };
            expect(names).to.deep.include({ fixed: ' t:a b  p:c', namespaces });
            expect(Object.keys(names!.namespaces!)).to.deep.equal(['t', '', 'p']);
            expect(plain).not.to.have.property('namespaces');
            expect(text).to.deep.include({ fixed: 't:x', namespaces: { t: 'urn:t' } });
            const { attributes } = text!.type as x.ComplexType;
            expect(attributes![0]).not.to.have.property('namespaces');
            expect(attributes![1]).to.deep.include({ namespaces: { t: 'urn:t' } });
            const [reference] = ((list!.type as x.ComplexType).content as x.Sequence).particles;
            expect(reference).to.deep.include({ minOccurs: 0, namespaces });
            expect(parse('<names xmlns="urn:t"/>', names!)).to.deep.equal([
                { namespace: 'urn:t', localName: 'a' },
                { namespace: 'urn:d', localName: 'b' },
                { namespace: 'urn:p', localName: 'c' },
            ]);
            expect(parse('<text xmlns="urn:t" xmlns:q="urn:t">q:x</text>', text!)).to.deep.equal({
                attributes: {
                    kind: { namespace: null, localName: 'kind' },
                    either: { namespace: 'urn:t', localName: 'u' },
                },
                text: { namespace: 'urn:t', localName: 'x' },
            });
        });

        test('Keeps a fixed QName attribute that another prefix writes in its scope', async () => {
            const { elements } = await loadSchema(
                `<xs:attribute name="at" type="xs:QName" fixed="t:v"/>
                <xs:complexType name="Base">
                    <xs:attribute ref="t:at"/>
                    <xs:attribute name="local" type="xs:QName" fixed="t:w"/>
                </xs:complexType>
                <xs:element name="e"><xs:complexType><xs:complexContent>
                    <xs:restriction base="t:Base">
                        <xs:attribute ref="q:at" fixed="q:v" xmlns:q="urn:t"/>
                        <xs:attribute name="local" type="xs:QName" fixed="w" xmlns="urn:t"/>
                    </xs:restriction>
                </xs:complexContent></xs:complexType></xs:element>`,
                tns
            );
            const { attributes } = elements[0]!.type as x.ComplexType;
            expect(attributes).to.deep.equal([
                {
                    kind: 'attribute',
                    name: 'at',
                    type: { kind: 'QName' },
                    namespace: 'urn:t',
                    fixed: 'q:v',
                    namespaces: { q: 'urn:t' },
                },
                {
                    kind: 'attribute',
                    name: 'local',
                    type: { kind: 'QName' },
                    fixed: 'w',
                    namespaces: { '': 'urn:t' },
                },
            ]);
            expect(parse('<e xmlns="urn:t"/>', elements[0]!)).to.deep.equal({
                attributes: {
                    at: { namespace: 'urn:t', localName: 'v' },
                    local: { namespace: 'urn:t', localName: 'w' },
                },
            });
        });

        test('Keeps the fixed value of an attribute a reference writes differently', async () => {
            const { elements } = await loadSchema(
                `<xs:attribute name="n" type="xs:int" fixed="1"/>
                <xs:element name="e"><xs:complexType>
                    <xs:attribute ref="t:n" fixed="01"/>
                </xs:complexType></xs:element>`,
                tns
            );
            expect(parse('<e xmlns="urn:t"/>', elements[0]!)).to.deep.equal({
                attributes: { n: 1 },
            });
        });

        test('Ignores attributes in other namespaces', async () => {
            const { elements } = await loadSchema(
                '<xs:element name="a" type="xs:string" ext:note="x" xmlns:ext="urn:ext"/>'
            );
            expect(elements[0]!.type).to.deep.equal({ kind: 'string' });
        });

        test('Holds an anonymous simple type', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="size">
                    <xs:simpleType><xs:restriction base="xs:string"><xs:enumeration value="S"/><xs:enumeration value="M"/></xs:restriction></xs:simpleType>
                </xs:element>`
            );
            expect(elements[0]!.type).to.deep.equal({
                kind: 'string',
                facets: { enumeration: ['S', 'M'] },
            });
        });
    });

    suite('Local elements', () => {
        test('Are unqualified by default, qualified by elementFormDefault or form', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="root"><xs:complexType><xs:sequence>
                    <xs:element name="a" type="xs:string"/>
                    <xs:element name="b" type="xs:string" form="qualified"/>
                </xs:sequence></xs:complexType></xs:element>
                <xs:element name="other"><xs:complexType><xs:sequence>
                    <xs:element name="c" type="xs:string" form="unqualified" nillable="1" fixed="c"/>
                </xs:sequence></xs:complexType></xs:element>`,
                tns
            );
            expect(
                parse('<t:root xmlns:t="urn:t"><a>1</a><t:b>2</t:b></t:root>', elements[0]!)
            ).to.deep.equal({ attributes: {}, children: { a: '1', b: '2' } });
            const qualified = await loadSchema(
                `<xs:element name="root"><xs:complexType><xs:sequence>
                    <xs:element name="a" type="xs:string"/>
                    <xs:element name="b" type="xs:string" form="unqualified"/>
                </xs:sequence></xs:complexType></xs:element>`,
                `${tns} elementFormDefault="qualified"`
            );
            expect(
                parse(
                    '<root xmlns="urn:t"><a>1</a><b xmlns="">2</b></root>',
                    qualified.elements[0]!
                )
            ).to.deep.equal({ attributes: {}, children: { a: '1', b: '2' } });
            expect(elements[1]!.type).to.deep.equal({
                kind: 'complex',
                content: {
                    kind: 'sequence',
                    particles: [
                        {
                            kind: 'element',
                            name: 'c',
                            type: { kind: 'string' },
                            nillable: true,
                            fixed: 'c',
                        },
                    ],
                },
            });
        });

        test('Refer to global elements, copied with their own occurrences', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="item" type="xs:int"/>
                <xs:element name="list"><xs:complexType><xs:sequence>
                    <xs:element ref="t:item"/>
                    <xs:element ref="t:item" minOccurs="0" maxOccurs="unbounded"/>
                </xs:sequence></xs:complexType></xs:element>`,
                tns
            );
            const [item, list] = elements;
            const particles = (
                list!.type as { readonly content: { readonly particles: readonly unknown[] } }
            ).content.particles;
            expect(particles[0]).to.equal(item);
            expect(particles[1]).to.deep.include({
                name: 'item',
                namespace: 'urn:t',
                minOccurs: 0,
                maxOccurs: 'unbounded',
            });
            expect(item).not.to.have.property('minOccurs');
        });

        test('Drop particles that can never occur', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="e"><xs:complexType><xs:sequence>
                    <xs:element name="a" type="xs:string" maxOccurs="0" minOccurs="0"/>
                    <xs:element name="b" type="xs:string" minOccurs="+2" maxOccurs=" 3 "/>
                    <xs:any maxOccurs="0" minOccurs="0"/>
                    <xs:sequence maxOccurs="0" minOccurs="0"><xs:element name="c"/></xs:sequence>
                    <xs:group ref="g" maxOccurs="0" minOccurs="0"/>
                    <xs:element ref="d" maxOccurs="0" minOccurs="0"/>
                </xs:sequence></xs:complexType></xs:element>
                <xs:group name="g"><xs:sequence><xs:element name="d"/></xs:sequence></xs:group>
                <xs:element name="d"/>`
            );
            expect(elements[0]!.type).to.deep.equal({
                kind: 'complex',
                content: {
                    kind: 'sequence',
                    particles: [
                        {
                            kind: 'element',
                            name: 'b',
                            type: { kind: 'string' },
                            minOccurs: 2,
                            maxOccurs: 3,
                        },
                    ],
                },
            });
        });
    });

    suite('Attributes', () => {
        test('Local attributes: use, default, fixed, form and attributeFormDefault', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="e"><xs:complexType>
                    <xs:attribute name="a" type="xs:int" use="required"/>
                    <xs:attribute name="b" default="x"/>
                    <xs:attribute name="c" type="xs:string" fixed="y" form="qualified"/>
                    <xs:attribute name="d" use="optional" form="unqualified">
                        <xs:simpleType><xs:list itemType="xs:int"/></xs:simpleType>
                    </xs:attribute>
                    <xs:attribute name="gone" type="xs:string" use="prohibited"/>
                </xs:complexType></xs:element>`,
                tns
            );
            expect(elements[0]!.type).to.deep.equal({
                kind: 'complex',
                attributes: [
                    { kind: 'attribute', name: 'a', type: { kind: 'int' }, use: 'required' },
                    { kind: 'attribute', name: 'b', type: { kind: 'string' }, default: 'x' },
                    {
                        kind: 'attribute',
                        name: 'c',
                        type: { kind: 'string' },
                        namespace: 'urn:t',
                        fixed: 'y',
                    },
                    {
                        kind: 'attribute',
                        name: 'd',
                        type: { kind: 'list', item: { kind: 'int' } },
                    },
                ],
            });
            const qualified = await loadSchema(
                '<xs:element name="e"><xs:complexType><xs:attribute name="a"/></xs:complexType></xs:element>',
                `${tns} attributeFormDefault="qualified"`
            );
            expect(qualified.elements[0]!.type).to.deep.equal({
                kind: 'complex',
                attributes: [
                    { kind: 'attribute', name: 'a', type: { kind: 'string' }, namespace: 'urn:t' },
                ],
            });
        });

        test('Global attributes are qualified, and references may add a use or value', async () => {
            const { elements } = await loadSchema(
                `<xs:attribute name="lang" type="xs:language"/>
                <xs:attribute name="v" type="xs:string" fixed="1"/>
                <xs:element name="e"><xs:complexType>
                    <xs:attribute ref="t:lang" use="required"/>
                    <xs:attribute ref="t:v" fixed="1"/>
                </xs:complexType></xs:element>
                <xs:element name="f"><xs:complexType>
                    <xs:attribute ref="t:lang" default="en"/>
                    <xs:attribute ref="t:v"/>
                </xs:complexType></xs:element>`,
                tns
            );
            const [e, f] = elements.map(
                element => (element.type as { readonly attributes: readonly unknown[] }).attributes
            );
            expect(e).to.deep.equal([
                {
                    kind: 'attribute',
                    name: 'lang',
                    type: { kind: 'language' },
                    namespace: 'urn:t',
                    use: 'required',
                },
                {
                    kind: 'attribute',
                    name: 'v',
                    type: { kind: 'string' },
                    namespace: 'urn:t',
                    fixed: '1',
                },
            ]);
            expect(f).to.deep.equal([
                {
                    kind: 'attribute',
                    name: 'lang',
                    type: { kind: 'language' },
                    namespace: 'urn:t',
                    default: 'en',
                },
                {
                    kind: 'attribute',
                    name: 'v',
                    type: { kind: 'string' },
                    namespace: 'urn:t',
                    fixed: '1',
                },
            ]);
        });

        test('Attribute groups are inlined, with their prohibitions and wildcards', async () => {
            const { elements } = await loadSchema(
                `<xs:attributeGroup name="common">
                    <xs:attribute name="id" type="xs:ID"/>
                    <xs:attributeGroup ref="t:more"/>
                    <xs:anyAttribute namespace="##other"/>
                </xs:attributeGroup>
                <xs:attributeGroup name="more">
                    <xs:attribute name="class" type="xs:NMTOKENS"/>
                    <xs:attribute name="no" use="prohibited"/>
                </xs:attributeGroup>
                <xs:element name="e"><xs:complexType>
                    <xs:attributeGroup ref="t:common"/>
                    <xs:anyAttribute namespace="urn:a urn:b ##local"/>
                </xs:complexType></xs:element>`,
                tns
            );
            expect(withoutDeclarations(elements[0]!.type)).to.deep.equal({
                kind: 'complex',
                attributes: [
                    { kind: 'attribute', name: 'id', type: { kind: 'ID' } },
                    {
                        kind: 'attribute',
                        name: 'class',
                        type: { kind: 'list', item: { kind: 'NMTOKEN' }, facets: { minLength: 1 } },
                    },
                    {
                        kind: 'anyAttribute',
                        namespace: ['urn:a', 'urn:b'],
                        processContents: 'strict',
                    },
                ],
            });
        });

        test('Attribute wildcards: any, other, target namespace and local', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="a"><xs:complexType><xs:anyAttribute processContents="lax"/></xs:complexType></xs:element>
                <xs:element name="b"><xs:complexType><xs:anyAttribute namespace="##other" processContents="skip"/></xs:complexType></xs:element>
                <xs:element name="c"><xs:complexType><xs:anyAttribute namespace="##targetNamespace ##local" processContents="strict"/></xs:complexType></xs:element>`,
                tns
            );
            expect(
                elements.map(element =>
                    withoutDeclarations(
                        (element.type as { readonly attributes: readonly unknown[] }).attributes
                    )
                )
            ).to.deep.equal([
                [{ kind: 'anyAttribute', processContents: 'lax' }],
                [{ kind: 'anyAttribute', notNamespace: ['urn:t', null], processContents: 'skip' }],
                [{ kind: 'anyAttribute', namespace: ['urn:t', null], processContents: 'strict' }],
            ]);
        });

        test('Attribute wildcards intersect in a type, and unite in an extension', async () => {
            const { types } = await loadSchema(
                `<xs:attributeGroup name="any"><xs:anyAttribute/></xs:attributeGroup>
                <xs:attributeGroup name="a"><xs:anyAttribute namespace="urn:a"/></xs:attributeGroup>
                <xs:attributeGroup name="other"><xs:anyAttribute namespace="##other"/></xs:attributeGroup>
                <xs:complexType name="AnyThenA"><xs:attributeGroup ref="t:any"/><xs:anyAttribute namespace="urn:a"/></xs:complexType>
                <xs:complexType name="AThenAny"><xs:attributeGroup ref="t:a"/><xs:anyAttribute/></xs:complexType>
                <xs:complexType name="Other"><xs:attributeGroup ref="t:other"/><xs:anyAttribute namespace="##other"/></xs:complexType>
                <xs:complexType name="OtherAgain"><xs:complexContent><xs:extension base="t:Other">
                    <xs:anyAttribute namespace="##other"/>
                </xs:extension></xs:complexContent></xs:complexType>
                <xs:complexType name="OtherOrLocal"><xs:complexContent><xs:extension base="t:Other">
                    <xs:anyAttribute namespace="##targetNamespace ##local"/>
                </xs:extension></xs:complexContent></xs:complexType>
                <xs:complexType name="AOrOther"><xs:complexContent><xs:extension base="t:AThenAny">
                    <xs:anyAttribute namespace="##other"/>
                </xs:extension></xs:complexContent></xs:complexType>`,
                tns
            );
            expect(
                types.map(({ type }) =>
                    withoutDeclarations(
                        (type as { readonly attributes: readonly unknown[] }).attributes
                    )
                )
            ).to.deep.equal([
                [{ kind: 'anyAttribute', namespace: ['urn:a'], processContents: 'strict' }],
                [{ kind: 'anyAttribute', namespace: ['urn:a'], processContents: 'strict' }],
                [
                    {
                        kind: 'anyAttribute',
                        notNamespace: ['urn:t', null],
                        processContents: 'strict',
                    },
                ],
                [
                    {
                        kind: 'anyAttribute',
                        notNamespace: ['urn:t', null],
                        processContents: 'strict',
                    },
                ],
                [{ kind: 'anyAttribute', processContents: 'strict' }],
                [
                    {
                        kind: 'anyAttribute',
                        notNamespace: ['urn:t', null],
                        processContents: 'strict',
                    },
                ],
            ]);
        });

        test('Wildcards validate against the global declarations their namespaces allow', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="note" type="xs:int"/>
                <xs:attribute name="flag" type="xs:boolean"/>
                <xs:element name="open"><xs:complexType>
                    <xs:sequence><xs:any namespace="##targetNamespace" processContents="lax" maxOccurs="unbounded"/></xs:sequence>
                    <xs:anyAttribute namespace="##targetNamespace"/>
                </xs:complexType></xs:element>
                <xs:element name="closed"><xs:complexType>
                    <xs:sequence><xs:any namespace="##other"/></xs:sequence>
                </xs:complexType></xs:element>`,
                tns
            );
            const [note, open, closed] = elements;
            const openType = open!.type as x.ComplexType;
            const any = openType.content!.particles[0] as x.Any;
            expect(any.declarations!()).to.deep.equal([note, open, closed]);
            const anyAttribute = openType.attributes![0] as x.AnyAttribute;
            expect(anyAttribute.declarations!().map(({ name }) => name)).to.deep.equal(['flag']);
            const otherAny = (closed!.type as x.ComplexType).content!.particles[0] as x.Any;
            expect(otherAny).to.include({ processContents: 'strict' });
            expect(otherAny.declarations!()).to.deep.equal([]);
            expect(() => parse('<t:open xmlns:t="urn:t" t:flag="maybe"/>', open!)).to.throw(
                XeneverValidationError,
                /not a valid boolean/v
            );
            expect(() =>
                parse('<t:open xmlns:t="urn:t"><t:note>x</t:note></t:open>', open!)
            ).to.throw(XeneverValidationError, /not a valid int/v);
            expect(() =>
                parse('<t:closed xmlns:t="urn:t"><o:x xmlns:o="urn:o"/></t:closed>', closed!)
            ).to.throw(XeneverValidationError, /strict wildcard/v);
        });

        test("An attribute wildcard takes its own processContents, else the first attribute group's, and an extension's", async () => {
            const { types } = await loadSchema(
                `<xs:attributeGroup name="lax"><xs:anyAttribute processContents="lax"/></xs:attributeGroup>
                <xs:attributeGroup name="skip"><xs:anyAttribute processContents="skip"/></xs:attributeGroup>
                <xs:complexType name="Own"><xs:attributeGroup ref="t:lax"/><xs:anyAttribute processContents="skip"/></xs:complexType>
                <xs:complexType name="First"><xs:attributeGroup ref="t:skip"/><xs:attributeGroup ref="t:lax"/></xs:complexType>
                <xs:complexType name="Extended"><xs:complexContent><xs:extension base="t:First">
                    <xs:anyAttribute processContents="lax"/>
                </xs:extension></xs:complexContent></xs:complexType>`,
                tns
            );
            expect(
                types.map(
                    ({ type }) =>
                        ((type as x.ComplexType).attributes![0] as x.AnyAttribute).processContents
                )
            ).to.deep.equal(['skip', 'skip', 'lax']);
        });

        test('Attribute wildcards count the built-in XML attributes only when the namespace is imported', async () => {
            const [imported, notImported] = await Promise.all([
                loadSchema(
                    `<xs:import namespace="http://www.w3.org/XML/1998/namespace"/>
                    <xs:element name="e"><xs:complexType><xs:anyAttribute namespace="##other"/></xs:complexType></xs:element>`
                ),
                loadSchema(
                    '<xs:element name="e"><xs:complexType><xs:anyAttribute namespace="##other"/></xs:complexType></xs:element>'
                ),
            ]);
            expect(parse('<e xml:lang="en"/>', imported.elements[0]!)).to.deep.equal({
                attributes: {
                    '#any': [
                        {
                            namespace: 'http://www.w3.org/XML/1998/namespace',
                            localName: 'lang',
                            value: 'en',
                        },
                    ],
                },
            });
            expect(() => parse('<e xml:lang="en"/>', notImported.elements[0]!)).to.throw(
                XeneverValidationError,
                /strict attribute wildcard/v
            );
        });

        test('The XML namespace is built in', async () => {
            const { elements } = await loadSchema(
                `<xs:import namespace="http://www.w3.org/XML/1998/namespace" schemaLocation="https://www.w3.org/2001/xml.xsd"/>
                <xs:element name="e"><xs:complexType>
                    <xs:attribute ref="xml:id"/>
                    <xs:attributeGroup ref="xml:specialAttrs"/>
                </xs:complexType></xs:element>`
            );
            const value = parse(
                '<e xml:id="a" xml:lang="en" xml:space="preserve" xml:base="https://x/"/>',
                elements[0]!
            );
            expect(value).to.deep.equal({
                attributes: { id: 'a', lang: 'en', space: 'preserve', base: 'https://x/' },
            });
        });
    });
});
