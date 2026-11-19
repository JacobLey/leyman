import type { x } from 'xenever';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse } from 'xenever';
import { loadSchema, withoutDeclarations } from './helpers.js';

const tns = 'targetNamespace="urn:t" xmlns:t="urn:t"';

/**
 * The content of an element's complex type.
 *
 * @param element - an element of a complex type with child elements
 * @returns its model group
 */
const contentOf = (element: x.Element): x.ModelGroup => (element.type as x.ComplexType).content!;

suite('loadXsd types', () => {
    suite('Named types', () => {
        test('Are listed in document order, each one object wherever it is used', async () => {
            const { elements, types } = await loadSchema(
                `<xs:complexType name="Point"><xs:sequence>
                    <xs:element name="x" type="xs:int"/><xs:element name="y" type="xs:int"/>
                </xs:sequence></xs:complexType>
                <xs:element name="a" type="t:Point"/>
                <xs:simpleType name="Name"><xs:restriction base="xs:token"/></xs:simpleType>
                <xs:element name="b" type="t:Point"/>
                <xs:element name="c" type="t:Name"/>`,
                tns
            );
            expect(types.map(({ name, namespace }) => [name, namespace])).to.deep.equal([
                ['Point', 'urn:t'],
                ['Name', 'urn:t'],
            ]);
            expect(elements[0]!.type).to.equal(types[0]!.type);
            expect(elements[1]!.type).to.equal(types[0]!.type);
            expect(elements[2]!.type).to.equal(types[1]!.type);
            expect(
                parse('<t:a xmlns:t="urn:t"><x>1</x><y>2</y></t:a>', elements[0]!)
            ).to.deep.equal({
                attributes: {},
                children: { x: 1, y: 2 },
            });
        });

        test('Have no namespace without a target namespace', async () => {
            const { types } = await loadSchema(
                '<xs:simpleType name="S"><xs:restriction base="xs:string"/></xs:simpleType>'
            );
            expect(types[0]).to.deep.equal({ name: 'S', type: { kind: 'string' } });
        });

        test('May be used before they are defined, and by types not used by any element', async () => {
            const { types } = await loadSchema(
                `<xs:complexType name="A"><xs:sequence><xs:element name="b" type="t:B"/></xs:sequence></xs:complexType>
                <xs:complexType name="B"><xs:attribute name="n" type="xs:int"/></xs:complexType>`,
                tns
            );
            expect((types[0]!.type as x.ComplexType).content!.particles[0]).to.deep.include({
                type: types[1]!.type,
            });
        });
    });

    suite('Recursion', () => {
        test('An element whose type contains itself becomes a lazy reference', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="tree" type="t:Node"/>
                <xs:complexType name="Node"><xs:sequence>
                    <xs:element name="label" type="xs:string"/>
                    <xs:element name="node" type="t:Node" minOccurs="0" maxOccurs="unbounded"/>
                </xs:sequence></xs:complexType>`,
                `${tns} elementFormDefault="qualified"`
            );
            const [tree] = elements;
            const lazy = contentOf(tree!).particles[1] as x.Lazy;
            expect(lazy).to.include({ kind: 'lazy', minOccurs: 0, maxOccurs: 'unbounded' });
            const node = lazy.get();
            expect(node).to.include({ kind: 'element', name: 'node', namespace: 'urn:t' });
            expect(node).not.to.have.any.keys('minOccurs', 'maxOccurs');
            expect(node.type).to.equal(tree!.type);
            expect(
                parse(
                    '<tree xmlns="urn:t"><label>a</label><node><label>b</label><node><label>c</label></node></node></tree>',
                    tree!
                )
            ).to.deep.equal({
                attributes: {},
                children: {
                    label: 'a',
                    node: [
                        {
                            attributes: {},
                            children: {
                                label: 'b',
                                node: [{ attributes: {}, children: { label: 'c' } }],
                            },
                        },
                    ],
                },
            });
        });

        test('A reference to a global element whose type contains it points at the global element', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="section"><xs:complexType><xs:sequence>
                    <xs:element name="title" type="xs:string"/>
                    <xs:element ref="t:section" minOccurs="0" maxOccurs="unbounded"/>
                    <xs:element ref="t:section" minOccurs="0"/>
                    <xs:element ref="t:section"/>
                </xs:sequence></xs:complexType></xs:element>`,
                tns
            );
            const [section] = elements;
            const [, many, optional, once] = contentOf(section!).particles as x.Lazy[];
            expect(many!.get()).to.equal(section);
            expect(optional!.get()).to.equal(section);
            expect(once).to.include({ kind: 'lazy' });
            expect(once).not.to.have.any.keys('minOccurs', 'maxOccurs');
        });

        test('A cycle through anonymous types and groups is broken once', async () => {
            const { elements, types } = await loadSchema(
                `<xs:group name="items"><xs:choice>
                    <xs:element name="leaf" type="xs:int"/>
                    <xs:element name="list"><xs:complexType><xs:group ref="t:items" maxOccurs="unbounded"/></xs:complexType></xs:element>
                </xs:choice></xs:group>
                <xs:element name="root"><xs:complexType><xs:group ref="t:items"/></xs:complexType></xs:element>
                <xs:complexType name="Wrapper"><xs:sequence><xs:element name="w" type="t:Wrapper" minOccurs="0"/></xs:sequence></xs:complexType>`,
                tns
            );
            const value = parse(
                '<t:root xmlns:t="urn:t"><list><leaf>1</leaf><list><leaf>2</leaf></list></list></t:root>',
                elements[0]!
            );
            expect(value).to.deep.equal({
                attributes: {},
                children: {
                    list: {
                        attributes: {},
                        children: {
                            leaf: [1],
                            list: [{ attributes: {}, children: { leaf: [2] } }],
                        },
                    },
                },
            });
            const wrapper = types[0]!.type as x.ComplexType;
            expect((wrapper.content!.particles[0] as x.Lazy).get().type).to.equal(wrapper);
        });
    });

    suite('Model groups', () => {
        test('Sequence, choice and all with occurrences, and group references', async () => {
            const { elements } = await loadSchema(
                `<xs:group name="pair"><xs:sequence><xs:element name="a" type="xs:int"/><xs:element name="b" type="xs:int"/></xs:sequence></xs:group>
                <xs:group name="unordered"><xs:all><xs:element name="p" type="xs:int"/><xs:element name="q" type="xs:int" minOccurs="0"/></xs:all></xs:group>
                <xs:element name="s"><xs:complexType><xs:sequence>
                    <xs:group ref="t:pair" minOccurs="0" maxOccurs="2"/>
                    <xs:group ref="t:pair"/>
                    <xs:choice minOccurs="0"><xs:element name="c" type="xs:int"/><xs:any namespace="urn:x" processContents="skip"/></xs:choice>
                </xs:sequence></xs:complexType></xs:element>
                <xs:element name="u"><xs:complexType><xs:group ref="t:unordered"/></xs:complexType></xs:element>
                <xs:element name="v"><xs:complexType><xs:all minOccurs="0"><xs:element name="z" type="xs:int"/></xs:all></xs:complexType></xs:element>`,
                tns
            );
            const [s, u, v] = elements;
            const [twice, once, choice] = contentOf(s!).particles;
            expect(twice).to.include({ kind: 'sequence', minOccurs: 0, maxOccurs: 2 });
            expect(once).to.include({ kind: 'sequence' }).and.not.have.any.keys('minOccurs');
            expect(choice).to.deep.equal({
                kind: 'choice',
                minOccurs: 0,
                particles: [
                    { kind: 'element', name: 'c', type: { kind: 'int' } },
                    { kind: 'any', namespace: ['urn:x'], processContents: 'skip' },
                ],
            });
            expect(contentOf(u!)).to.include({ kind: 'all' });
            expect(contentOf(v!)).to.include({ kind: 'all', minOccurs: 0 });
            expect(parse('<t:u xmlns:t="urn:t"><q>2</q><p>1</p></t:u>', u!)).to.deep.equal({
                attributes: {},
                children: { p: 1, q: 2 },
            });
        });

        test('Empty content: no content, unless mixed, which is text only', async () => {
            const { elements } = await loadSchema(
                `<xs:element name="a"><xs:complexType><xs:sequence/></xs:complexType></xs:element>
                <xs:element name="b"><xs:complexType mixed="true"/></xs:element>
                <xs:element name="c"><xs:complexType><xs:choice minOccurs="0"/></xs:complexType></xs:element>
                <xs:element name="d"><xs:complexType><xs:choice/></xs:complexType></xs:element>`
            );
            expect(elements.map(({ type }) => type)).to.deep.equal([
                { kind: 'complex' },
                { kind: 'complex', mixed: true, content: { kind: 'sequence', particles: [] } },
                { kind: 'complex' },
                { kind: 'complex', content: { kind: 'choice', particles: [] } },
            ]);
        });
    });

    suite('Complex content', () => {
        test('An extension appends its particle and attributes to the base type', async () => {
            const { elements, types } = await loadSchema(
                `<xs:complexType name="Base">
                    <xs:sequence><xs:element name="a" type="xs:int"/></xs:sequence>
                    <xs:attribute name="x" type="xs:int"/>
                    <xs:anyAttribute namespace="urn:a"/>
                </xs:complexType>
                <xs:complexType name="Derived"><xs:complexContent>
                    <xs:extension base="t:Base">
                        <xs:sequence><xs:element name="b" type="xs:int"/></xs:sequence>
                        <xs:attribute name="y" type="xs:int"/>
                        <xs:anyAttribute namespace="urn:b"/>
                    </xs:extension>
                </xs:complexContent></xs:complexType>
                <xs:element name="e" type="t:Derived"/>`,
                tns
            );
            const [base, derived] = types.map(({ type }) => type as x.ComplexType);
            const [inherited, own] = derived!.content!.particles;
            expect(derived!.content!.kind).to.equal('sequence');
            expect(inherited).to.equal(base!.content);
            expect(own).to.deep.equal({
                kind: 'sequence',
                particles: [{ kind: 'element', name: 'b', type: { kind: 'int' } }],
            });
            expect(withoutDeclarations(derived!.attributes)).to.deep.equal([
                { kind: 'attribute', name: 'x', type: { kind: 'int' } },
                { kind: 'attribute', name: 'y', type: { kind: 'int' } },
                { kind: 'anyAttribute', namespace: ['urn:a', 'urn:b'], processContents: 'strict' },
            ]);
            expect(
                parse('<t:e xmlns:t="urn:t" x="1" y="2"><a>1</a><b>2</b></t:e>', elements[0]!)
            ).to.deep.equal({ attributes: { x: 1, y: 2 }, children: { a: 1, b: 2 } });
        });

        test('An extension without a particle keeps the base content; one of an empty base takes its own', async () => {
            const { types } = await loadSchema(
                `<xs:complexType name="Mixed" mixed="true"><xs:sequence><xs:element name="a"/></xs:sequence><xs:anyAttribute/></xs:complexType>
                <xs:complexType name="SameContent"><xs:complexContent><xs:extension base="t:Mixed">
                    <xs:attribute name="n" type="xs:int"/><xs:anyAttribute namespace="##local"/>
                </xs:extension></xs:complexContent></xs:complexType>
                <xs:complexType name="Empty"><xs:attribute name="id" type="xs:ID"/></xs:complexType>
                <xs:complexType name="Filled"><xs:complexContent mixed="true"><xs:extension base="t:Empty">
                    <xs:sequence><xs:element name="b"/></xs:sequence>
                </xs:extension></xs:complexContent></xs:complexType>
                <xs:complexType name="StillEmpty"><xs:complexContent><xs:extension base="t:Empty"/></xs:complexContent></xs:complexType>
                <xs:complexType name="AnyExtended"><xs:complexContent><xs:extension base="xs:anyType"/></xs:complexContent></xs:complexType>
                <xs:complexType name="Bare"><xs:sequence><xs:element name="c"/></xs:sequence></xs:complexType>
                <xs:complexType name="BareExtended"><xs:complexContent><xs:extension base="t:Bare"/></xs:complexContent></xs:complexType>`,
                tns
            );
            const [mixed, same, empty, filled, stillEmpty, anyExtended, bare, bareExtended] =
                types.map(({ type }) => type as x.ComplexType);
            expect(same!.content).to.equal(mixed!.content);
            expect(same).to.include({ mixed: true });
            expect(withoutDeclarations(same!.attributes!.at(-1))).to.deep.equal({
                kind: 'anyAttribute',
                processContents: 'strict',
            });
            expect(filled).to.include({ mixed: true });
            expect(filled!.attributes).to.deep.equal(empty!.attributes);
            expect(stillEmpty).to.deep.equal({ ...empty, name: 'StillEmpty' });
            expect(anyExtended).to.include({ mixed: true });
            expect(bareExtended).to.deep.equal({ ...bare, name: 'BareExtended' });
        });

        test('A mixed extension without a particle keeps mixed content, or makes empty content text only', async () => {
            const { types } = await loadSchema(
                `<xs:complexType name="Mixed" mixed="true"><xs:sequence><xs:element name="a"/></xs:sequence></xs:complexType>
                <xs:complexType name="StillMixed"><xs:complexContent mixed="true"><xs:extension base="t:Mixed"/></xs:complexContent></xs:complexType>
                <xs:complexType name="Empty"><xs:attribute name="id" type="xs:ID"/></xs:complexType>
                <xs:complexType name="Text" mixed="true"><xs:complexContent><xs:extension base="t:Empty"/></xs:complexContent></xs:complexType>`,
                tns
            );
            const [mixed, stillMixed, empty, text] = types.map(({ type }) => type as x.ComplexType);
            expect(stillMixed).to.deep.equal({ ...mixed, name: 'StillMixed' });
            expect(text).to.deep.equal({
                ...empty,
                name: 'Text',
                mixed: true,
                content: { kind: 'sequence', particles: [] },
            });
        });

        test('A restriction replaces the content, and restricts or inherits the attributes', async () => {
            const { types } = await loadSchema(
                `<xs:complexType name="Base" mixed="true">
                    <xs:sequence><xs:element name="a" minOccurs="0"/></xs:sequence>
                    <xs:attribute name="keep" type="xs:string"/>
                    <xs:attribute name="drop" type="xs:string"/>
                    <xs:attribute name="narrow" type="xs:string"/>
                    <xs:attribute name="must" type="xs:string" use="required"/>
                    <xs:attribute name="same" type="xs:string" fixed="v"/>
                    <xs:anyAttribute namespace="##any"/>
                </xs:complexType>
                <xs:complexType name="Restricted"><xs:complexContent><xs:restriction base="t:Base">
                    <xs:sequence/>
                    <xs:attribute name="drop" use="prohibited"/>
                    <xs:attribute name="narrow" type="xs:token"/>
                    <xs:attribute name="must" type="xs:string" use="required"/>
                    <xs:attribute name="same" type="xs:string" fixed="v"/>
                    <xs:attribute name="added" type="xs:int" form="qualified"/>
                </xs:restriction></xs:complexContent></xs:complexType>
                <xs:complexType name="MixedRestricted"><xs:complexContent mixed="true"><xs:restriction base="t:Base">
                    <xs:anyAttribute namespace="##other"/>
                </xs:restriction></xs:complexContent></xs:complexType>`,
                tns
            );
            const [, restricted, mixedRestricted] = types.map(({ type }) => type as x.ComplexType);
            expect(restricted).to.deep.equal({
                kind: 'complex',
                name: 'Restricted',
                namespace: 'urn:t',
                attributes: [
                    { kind: 'attribute', name: 'keep', type: { kind: 'string' } },
                    { kind: 'attribute', name: 'narrow', type: { kind: 'token' } },
                    { kind: 'attribute', name: 'must', type: { kind: 'string' }, use: 'required' },
                    { kind: 'attribute', name: 'same', type: { kind: 'string' }, fixed: 'v' },
                    {
                        kind: 'attribute',
                        name: 'added',
                        type: { kind: 'int' },
                        namespace: 'urn:t',
                    },
                ],
            });
            expect(mixedRestricted).to.deep.include({
                mixed: true,
                content: { kind: 'sequence', particles: [] },
            });
            expect(withoutDeclarations(mixedRestricted!.attributes!.at(-1))).to.deep.equal({
                kind: 'anyAttribute',
                notNamespace: ['urn:t', null],
                processContents: 'strict',
            });
        });
    });

    suite('Simple content', () => {
        test('An extension of a simple type adds attributes to text', async () => {
            const { elements, types } = await loadSchema(
                `<xs:complexType name="Money"><xs:simpleContent><xs:extension base="xs:decimal">
                    <xs:attribute name="currency" type="xs:string" use="required"/>
                </xs:extension></xs:simpleContent></xs:complexType>
                <xs:complexType name="Tagged"><xs:simpleContent><xs:extension base="t:Money">
                    <xs:attribute name="tag" type="xs:string"/>
                </xs:extension></xs:simpleContent></xs:complexType>
                <xs:element name="price" type="t:Tagged"/>`,
                tns
            );
            expect(types[0]!.type).to.deep.equal({
                kind: 'complex',
                name: 'Money',
                namespace: 'urn:t',
                attributes: [
                    {
                        kind: 'attribute',
                        name: 'currency',
                        type: { kind: 'string' },
                        use: 'required',
                    },
                ],
                text: { kind: 'decimal' },
            });
            expect(
                parse(
                    '<t:price xmlns:t="urn:t" currency="EUR" tag="a">1.50</t:price>',
                    elements[0]!
                )
            ).to.deep.equal({ attributes: { currency: 'EUR', tag: 'a' }, text: '1.5' });
        });

        test('A restriction narrows the text with facets or an anonymous type', async () => {
            const { types } = await loadSchema(
                `<xs:complexType name="Money"><xs:simpleContent><xs:extension base="xs:decimal">
                    <xs:attribute name="currency" type="xs:string"/>
                </xs:extension></xs:simpleContent></xs:complexType>
                <xs:complexType name="Small"><xs:simpleContent><xs:restriction base="t:Money">
                    <xs:maxInclusive value="10"/>
                    <xs:attribute name="currency" type="xs:string" use="required"/>
                </xs:restriction></xs:simpleContent></xs:complexType>
                <xs:complexType name="Whole"><xs:simpleContent><xs:restriction base="t:Money">
                    <xs:simpleType><xs:restriction base="xs:integer"/></xs:simpleType>
                    <xs:totalDigits value="3"/>
                </xs:restriction></xs:simpleContent></xs:complexType>
                <xs:complexType name="Same"><xs:simpleContent><xs:restriction base="t:Money"/></xs:simpleContent></xs:complexType>`,
                tns
            );
            const [money, small, whole, same] = types.map(({ type }) => type as x.ComplexType);
            expect(small).to.deep.equal({
                kind: 'complex',
                name: 'Small',
                namespace: 'urn:t',
                attributes: [
                    {
                        kind: 'attribute',
                        name: 'currency',
                        type: { kind: 'string' },
                        use: 'required',
                    },
                ],
                text: { kind: 'decimal', facets: { maxInclusive: '10' } },
            });
            expect(whole!.text).to.deep.equal({ kind: 'integer', facets: { totalDigits: 3 } });
            expect(same!.text).to.equal(money!.text);
        });

        test('A restriction of anySimpleType text keeps it, or narrows it with an anonymous type', async () => {
            const { types } = await loadSchema(
                `<xs:complexType name="Any"><xs:simpleContent><xs:extension base="xs:anySimpleType">
                    <xs:attribute name="a"/>
                </xs:extension></xs:simpleContent></xs:complexType>
                <xs:complexType name="Same"><xs:simpleContent><xs:restriction base="t:Any">
                    <xs:attribute name="a" use="prohibited"/>
                </xs:restriction></xs:simpleContent></xs:complexType>
                <xs:complexType name="Short"><xs:simpleContent><xs:restriction base="t:Any">
                    <xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType>
                    <xs:maxLength value="3"/>
                </xs:restriction></xs:simpleContent></xs:complexType>`,
                tns
            );
            const [any, same, short] = types.map(({ type }) => type as x.ComplexType);
            expect(same).to.deep.equal({
                kind: 'complex',
                name: 'Same',
                namespace: 'urn:t',
                text: any!.text,
            });
            expect(short!.text).to.deep.equal({ kind: 'string', facets: { maxLength: 3 } });
        });
    });

    suite('Options', () => {
        test('`bigint` makes big integer types bigint', async () => {
            const { elements } = await loadSchema(
                '<xs:element name="n" type="xs:long"/><xs:element name="m" type="xs:int"/>',
                '',
                { bigint: true }
            );
            expect(elements.map(({ type }) => type)).to.deep.equal([
                { kind: 'long', bigint: true },
                { kind: 'int' },
            ]);
            expect(parse('<n>9007199254740993</n>', elements[0]!)).to.equal(9_007_199_254_740_993n);
        });

        test('`ordered` orders the children of named types and of elements with anonymous types', async () => {
            const { elements, types } = await loadSchema(
                `<xs:complexType name="Body"><xs:choice maxOccurs="unbounded"><xs:element name="p" type="xs:string"/><xs:element name="h" type="xs:string"/></xs:choice></xs:complexType>
                <xs:element name="doc"><xs:complexType><xs:sequence><xs:element name="body" type="t:Body"/></xs:sequence></xs:complexType></xs:element>
                <xs:element name="Body" type="t:Body"/>`,
                tns,
                { ordered: ['{urn:t}Body', '{urn:t}doc'] }
            );
            expect(types[0]!.type).to.include({ ordered: true });
            expect(elements[0]!.type).to.include({ ordered: true });
            expect(
                parse('<t:Body xmlns:t="urn:t"><p>a</p><h>b</h><p>c</p></t:Body>', elements[1]!)
            ).to.deep.equal({
                attributes: {},
                children: [
                    { name: 'p', value: 'a' },
                    { name: 'h', value: 'b' },
                    { name: 'p', value: 'c' },
                ],
            });
        });
    });
});
