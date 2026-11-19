import type { x } from 'xenever';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import {
    parse,
    XeneverInvalidSchemaError,
    XeneverUnsupportedError,
    XeneverValidationError,
} from 'xenever';
import { expectSchemaError, loadFiles, loadSchema, mainPath, schema } from './helpers.js';

const tns = 'targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified"';

const types = `<xs:complexType name="Shape"><xs:attribute name="id" type="xs:string"/></xs:complexType>
<xs:complexType name="Circle"><xs:complexContent><xs:extension base="t:Shape">
    <xs:attribute name="r" type="xs:int"/>
</xs:extension></xs:complexContent></xs:complexType>
<xs:complexType name="Dot"><xs:complexContent><xs:restriction base="t:Circle">
    <xs:attribute name="r" type="xs:int" fixed="0"/>
</xs:restriction></xs:complexContent></xs:complexType>`;

/**
 * Declares a `drawing` of any number of references to an element.
 *
 * @param ref - name of the element referred to
 * @returns the global `xs:element`
 */
const drawing = (ref = 't:shape'): string =>
    `<xs:element name="drawing"><xs:complexType><xs:sequence>
        <xs:element ref="${ref}" minOccurs="0" maxOccurs="unbounded"/>
    </xs:sequence></xs:complexType></xs:element>`;

/**
 * Loads a schema of the shape types and a drawing, and returns what a reference to the head became.
 *
 * @param elements - the global elements
 * @param attributes - more attributes of `xs:schema`
 * @returns the `drawing` declaration, and the one particle of its content
 */
const loadDrawing = async (
    elements: string,
    attributes = ''
): Promise<{ readonly root: x.Element; readonly particle: x.Particle }> => {
    const set = await loadSchema(`${types}${elements}${drawing()}`, `${tns} ${attributes}`);
    const root = set.elements.find(element => element.name === 'drawing')!;
    const [particle] = (root.type as x.ComplexType).content!.particles;
    return { root, particle: particle! };
};

/**
 * Names the elements of a particle: of a choice, each of its particles.
 *
 * @param particle - an element or a choice of elements
 * @returns their local names
 */
const namesOf = (particle: x.Particle): readonly string[] =>
    (particle.kind === 'choice' ? particle.particles : [particle]).map(
        member => (member as x.Element).name
    );

suite('loadXsd substitution groups', () => {
    test('Turns a reference to a head into a choice of it and its members, in document order', async () => {
        const { root, particle } = await loadDrawing(
            `<xs:element name="big" type="t:Circle" substitutionGroup="t:circle"/>
            <xs:element name="shape" type="t:Shape"/>
            <xs:element name="circle" type="t:Circle" substitutionGroup="t:shape"/>`
        );
        expect(particle).to.include({ kind: 'choice', minOccurs: 0, maxOccurs: 'unbounded' });
        expect(namesOf(particle)).to.deep.equal(['shape', 'big', 'circle']);
        expect(
            parse(
                '<drawing xmlns="urn:t"><circle r="1"/><shape id="a"/><big/><circle/></drawing>',
                root
            )
        ).to.deep.equal({
            attributes: {},
            children: {
                shape: [{ type: 'Shape', attributes: { id: 'a' } }],
                big: [{ type: 'Circle', attributes: {} }],
                circle: [
                    { type: 'Circle', attributes: { r: 1 } },
                    { type: 'Circle', attributes: {} },
                ],
            },
        });
    });

    test('Uses the global declarations themselves as the particles', async () => {
        const set = await loadSchema(
            `${types}<xs:element name="shape" type="t:Shape"/>
            <xs:element name="circle" type="t:Circle" substitutionGroup="t:shape"/>${drawing()}`,
            tns
        );
        const [particle] = (set.elements[2]!.type as x.ComplexType).content!.particles as [
            x.Choice,
        ];
        expect(particle.particles).to.deep.equal([set.elements[0], set.elements[1]]);
        expect(particle.particles[1]).to.equal(set.elements[1]);
    });

    test('Leaves an abstract head out, and marks its declaration abstract', async () => {
        const { root, particle } = await loadDrawing(
            `<xs:element name="shape" type="t:Shape" abstract="true"/>
            <xs:element name="circle" type="t:Circle" substitutionGroup="t:shape"/>
            <xs:element name="dot" type="t:Dot" substitutionGroup="t:shape"/>`
        );
        expect(namesOf(particle)).to.deep.equal(['circle', 'dot']);
        expect(() => parse('<drawing xmlns="urn:t"><shape/></drawing>', root)).to.throw(
            XeneverValidationError,
            /^Element `shape` is not expected here; expected `circle` in `urn:t`, `dot` in `urn:t` or the end/v
        );
    });

    test('Makes an abstract head with one member that member, with the occurrences of the reference', async () => {
        const { root, particle } = await loadDrawing(
            `<xs:element name="shape" type="t:Shape" abstract="true"/>
            <xs:element name="circle" type="t:Circle" substitutionGroup="t:shape"/>`
        );
        expect(particle).to.include({
            kind: 'element',
            name: 'circle',
            minOccurs: 0,
            maxOccurs: 'unbounded',
        });
        expect(parse('<drawing xmlns="urn:t"><circle/></drawing>', root)).to.deep.equal({
            attributes: {},
            children: { circle: [{ type: 'Circle', attributes: {} }] },
        });
    });

    test('Keeps an abstract head nothing stands for, which matches nothing', async () => {
        const set = await loadSchema(
            `${types}<xs:element name="shape" type="t:Shape" abstract="true"/>${drawing()}`,
            tns
        );
        const [head, root] = set.elements;
        expect(head).to.include({ abstract: true });
        expect(parse('<drawing xmlns="urn:t"/>', root!)).to.deep.equal({
            attributes: {},
            children: {},
        });
        expect(() => parse('<drawing xmlns="urn:t"><shape/></drawing>', root!)).to.throw(
            XeneverValidationError,
            /^Element `shape` is not expected here; expected the end of `drawing`/v
        );
        expect(() => parse('<shape xmlns="urn:t"/>', head!)).to.throw(
            XeneverValidationError,
            /^Element `shape` is abstract/v
        );
    });

    test('Lets the members of an abstract member stand in', async () => {
        const { particle } = await loadDrawing(
            `<xs:element name="shape" type="t:Shape"/>
            <xs:element name="round" type="t:Circle" substitutionGroup="t:shape" abstract="true"/>
            <xs:element name="dot" type="t:Dot" substitutionGroup="t:round"/>`
        );
        expect(namesOf(particle)).to.deep.equal(['shape', 'dot']);
    });

    test('Gives a member without a type the type of its head', async () => {
        const set = await loadSchema(
            `${types}<xs:element name="copy" substitutionGroup="t:shape"/>
            <xs:element name="shape" type="t:Shape"/>`,
            tns
        );
        expect(set.elements[0]!.type).to.equal(set.elements[1]!.type);
    });

    test('Lets nothing stand for a head that blocks substitution', async () => {
        const { particle } = await loadDrawing(
            `<xs:element name="shape" type="t:Shape" block="substitution"/>
            <xs:element name="circle" type="t:Circle" substitutionGroup="t:shape"/>`
        );
        expect(namesOf(particle)).to.deep.equal(['shape']);
    });

    test('Leaves out members whose type derives by a method the head blocks', async () => {
        const { particle } = await loadDrawing(
            `<xs:element name="shape" type="t:Shape" block="restriction"/>
            <xs:element name="same" type="t:Shape" substitutionGroup="t:shape"/>
            <xs:element name="circle" type="t:Circle" substitutionGroup="t:shape"/>
            <xs:element name="dot" type="t:Dot" substitutionGroup="t:shape"/>`
        );
        expect(namesOf(particle)).to.deep.equal(['shape', 'same', 'circle']);
    });

    test('Takes the block of a head from blockDefault', async () => {
        const { particle } = await loadDrawing(
            `<xs:element name="shape" type="t:Shape"/>
            <xs:element name="circle" type="t:Circle" substitutionGroup="t:shape"/>`,
            'blockDefault="#all"'
        );
        expect(namesOf(particle)).to.deep.equal(['shape']);
    });

    test('Leaves out members whose type derives by a method a type on the way blocks', async () => {
        const blocking = types.replace('name="Circle"', 'name="Circle" block="restriction"');
        const set = await loadSchema(
            `${blocking}<xs:element name="shape" type="t:Shape"/>
            <xs:element name="circle" type="t:Circle" substitutionGroup="t:shape"/>
            <xs:element name="dot" type="t:Dot" substitutionGroup="t:shape"/>${drawing()}`,
            tns
        );
        const [particle] = (set.elements[3]!.type as x.ComplexType).content!.particles;
        expect(namesOf(particle!)).to.deep.equal(['shape', 'circle']);
    });

    test('Follows simple types to the type of the head', async () => {
        const set = await loadSchema(
            `<xs:simpleType name="Code"><xs:restriction base="xs:token"><xs:length value="2"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="Codes"><xs:list itemType="t:Code"/></xs:simpleType>
            <xs:complexType name="Tagged"><xs:simpleContent><xs:extension base="t:Code">
                <xs:attribute name="tag" type="xs:string"/>
            </xs:extension></xs:simpleContent></xs:complexType>
            <xs:element name="text" type="xs:string"/>
            <xs:element name="code" type="t:Code" substitutionGroup="t:text"/>
            <xs:element name="tagged" type="t:Tagged" substitutionGroup="t:code"/>
            <xs:element name="any" type="xs:anySimpleType"/>
            <xs:element name="codes" type="t:Codes" substitutionGroup="t:any"/>
            <xs:element name="count" type="xs:int" substitutionGroup="t:any"/>
            <xs:element name="anything"/>
            <xs:element name="all" type="xs:anySimpleType" substitutionGroup="t:anything"/>
            ${drawing('t:text')}`,
            tns
        );
        const [particle] = (set.elements.at(-1)!.type as x.ComplexType).content!.particles;
        expect(namesOf(particle!)).to.deep.equal(['text', 'code', 'tagged']);
    });

    test('Takes a member of a union, or a restriction of one, as derived from the union', async () => {
        const set = await loadSchema(
            `<xs:simpleType name="Size"><xs:union memberTypes="xs:int t:Name"/></xs:simpleType>
            <xs:simpleType name="Name"><xs:restriction base="xs:token"/></xs:simpleType>
            <xs:simpleType name="Short"><xs:restriction base="t:Name"><xs:maxLength value="1"/></xs:restriction></xs:simpleType>
            <xs:element name="size" type="t:Size"/>
            <xs:element name="count" type="xs:int" substitutionGroup="t:size"/>
            <xs:element name="short" type="t:Short" substitutionGroup="t:size"/>
            ${drawing('t:size')}`,
            tns
        );
        const [particle] = (set.elements.at(-1)!.type as x.ComplexType).content!.particles;
        expect(namesOf(particle!)).to.deep.equal(['size', 'count', 'short']);
    });

    test('Follows a complex type that names no base to xs:anyType', async () => {
        const set = await loadSchema(
            `<xs:element name="anything"/>
            <xs:element name="empty" substitutionGroup="anything"><xs:complexType/></xs:element>
            <xs:element name="list"><xs:complexType><xs:sequence>
                <xs:element ref="anything"/>
            </xs:sequence></xs:complexType></xs:element>`
        );
        const [particle] = (set.elements[2]!.type as x.ComplexType).content!.particles;
        expect(namesOf(particle!)).to.deep.equal(['anything', 'empty']);
    });

    test('Rejects a list as a member of a group whose head is an atomic type', async () => {
        await expectSchemaError(
            loadSchema(
                `<xs:simpleType name="Codes"><xs:list itemType="xs:token"/></xs:simpleType>
                <xs:element name="text" type="xs:string"/>
                <xs:element name="codes" type="t:Codes" substitutionGroup="t:text"/>`,
                tns
            ),
            XeneverInvalidSchemaError,
            /^The type of an element must derive from the type of \{urn:t\}text/v,
            { line: 3 }
        );
    });

    test('Reports members whose names differ only by namespace as a limit', async () => {
        await expectSchemaError(
            loadFiles({
                [mainPath]: schema(
                    `<xs:import namespace="urn:o" schemaLocation="other.xsd"/>
                    <xs:element name="shape"/><xs:element name="circle" substitutionGroup="t:shape"/>${drawing()}`,
                    tns
                ),
                '/schemas/other.xsd': schema(
                    `<xs:import namespace="urn:t" schemaLocation="main.xsd"/>
                    <xs:element name="circle" substitutionGroup="t:shape"/>`,
                    'targetNamespace="urn:o" xmlns:t="urn:t"'
                ),
            }),
            XeneverUnsupportedError,
            /^Key `circle` is used by two elements in one content model.*no way to give them separate keys/v
        );
    });

    test('Breaks a cycle through a member of a substitution group', async () => {
        const set = await loadSchema(
            `<xs:element name="node" type="t:Node"/>
            <xs:element name="leaf" type="t:Node" substitutionGroup="t:node"/>
            <xs:complexType name="Node"><xs:sequence>
                <xs:element ref="t:node" minOccurs="0" maxOccurs="unbounded"/>
            </xs:sequence></xs:complexType>`,
            tns
        );
        expect(
            parse('<node xmlns="urn:t"><leaf><node/></leaf><node/></node>', set.elements[0]!)
        ).to.deep.equal({
            attributes: {},
            children: {
                node: [{ attributes: {}, children: {} }],
                leaf: [{ attributes: {}, children: { node: [{ attributes: {}, children: {} }] } }],
            },
        });
    });
});
