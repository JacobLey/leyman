import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse } from 'xenever';
import { loadSchema } from './helpers.js';

const tns = 'targetNamespace="urn:t" xmlns:t="urn:t"';

/**
 * Loads named simple types.
 *
 * @param body - `xs:simpleType` elements, in the target namespace `urn:t`
 * @param options - more options of `loadXsd`
 * @param options.bigint - whether big integers are bigint
 * @returns the types, in order
 */
const loadTypes = async (
    body: string,
    options: { readonly bigint?: boolean } = {}
): Promise<readonly unknown[]> => {
    const { types } = await loadSchema(body, tns, options);
    return types.map(({ type }) => type);
};

suite('loadXsd simple types', () => {
    test('Built-in types, lists of them, and anySimpleType as text', async () => {
        const { elements } = await loadSchema(
            `<xs:element name="e"><xs:complexType>
                <xs:attribute name="any" type="xs:anySimpleType"/>
                <xs:attribute name="tokens" type="xs:NMTOKENS"/>
                <xs:attribute name="refs" type="xs:IDREFS"/>
                <xs:attribute name="entities" type="xs:ENTITIES"/>
                <xs:attribute name="date" type="xs:date"/>
            </xs:complexType></xs:element>`
        );
        expect(
            parse('<e any=" a b " tokens="a b" date="2024-01-02"/>', elements[0]!)
        ).to.deep.include({ attributes: { any: ' a b ', tokens: ['a', 'b'], date: '2024-01-02' } });
    });

    test('Patterns: alternatives in one step, all steps must match', async () => {
        const [code, narrower] = await loadTypes(
            `<xs:simpleType name="Code"><xs:restriction base="xs:string">
                <xs:pattern value="[A-Z]+"/><xs:pattern value="\\d+"/>
            </xs:restriction></xs:simpleType>
            <xs:simpleType name="Narrower"><xs:restriction base="t:Code">
                <xs:pattern value=".{2}"/>
            </xs:restriction></xs:simpleType>
            <xs:simpleType name="Narrowest"><xs:restriction base="t:Narrower">
                <xs:pattern value="A."/>
            </xs:restriction></xs:simpleType>`
        );
        expect(code).to.deep.equal({ kind: 'string', facets: { pattern: '[A-Z]+|\\d+' } });
        expect(narrower).to.deep.equal({
            kind: 'string',
            facets: { pattern: ['[A-Z]+|\\d+', '.{2}'] },
        });
    });

    test('Enumerations replace the base, read as the base type reads them', async () => {
        const types = await loadTypes(
            `<xs:simpleType name="Small"><xs:restriction base="xs:integer">
                <xs:enumeration value="01"/><xs:enumeration value="2"/><xs:enumeration value="1"/>
            </xs:restriction></xs:simpleType>
            <xs:simpleType name="One"><xs:restriction base="t:Small"><xs:enumeration value="1"/></xs:restriction></xs:simpleType>`,
            { bigint: true }
        );
        expect(types).to.deep.equal([
            { kind: 'integer', bigint: true, facets: { enumeration: ['1', '2'] } },
            { kind: 'integer', bigint: true, facets: { enumeration: ['1'] } },
        ]);
    });

    test('Lengths narrow the base', async () => {
        const valid = await loadTypes(
            `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:minLength value="1"/><xs:maxLength value="10"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="B"><xs:restriction base="t:A"><xs:minLength value="2"/><xs:maxLength value="9"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="C"><xs:restriction base="t:B"><xs:length value="5" fixed="true"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="D"><xs:restriction base="t:C"><xs:minLength value="5"/><xs:maxLength value="5"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="E"><xs:restriction base="t:C"><xs:length value="5"/></xs:restriction></xs:simpleType>`
        );
        expect(valid).to.deep.equal([
            { kind: 'string', facets: { minLength: 1, maxLength: 10 } },
            { kind: 'string', facets: { minLength: 2, maxLength: 9 } },
            { kind: 'string', facets: { length: 5 } },
            { kind: 'string', facets: { length: 5 } },
            { kind: 'string', facets: { length: 5 } },
        ]);
    });

    test('Digits and ranges narrow the base', async () => {
        const types = await loadTypes(
            `<xs:simpleType name="A"><xs:restriction base="xs:decimal">
                <xs:totalDigits value="5"/><xs:fractionDigits value="2"/>
                <xs:minInclusive value="0"/><xs:maxExclusive value="100"/>
            </xs:restriction></xs:simpleType>
            <xs:simpleType name="B"><xs:restriction base="t:A">
                <xs:totalDigits value="4"/><xs:minExclusive value="1"/>
            </xs:restriction></xs:simpleType>
            <xs:simpleType name="C"><xs:restriction base="xs:int"><xs:maxInclusive value="7"/></xs:restriction></xs:simpleType>`
        );
        expect(types).to.deep.equal([
            {
                kind: 'decimal',
                facets: {
                    totalDigits: 5,
                    fractionDigits: 2,
                    minInclusive: '0',
                    maxExclusive: '100',
                },
            },
            {
                kind: 'decimal',
                facets: {
                    totalDigits: 4,
                    fractionDigits: 2,
                    maxExclusive: '100',
                    minExclusive: '1',
                },
            },
            { kind: 'int', facets: { maxInclusive: 7 } },
        ]);
    });

    test('whiteSpace only gets stricter, and is left out where it changes nothing', async () => {
        const types = await loadTypes(
            `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:whiteSpace value="replace"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="B"><xs:restriction base="t:A"><xs:whiteSpace value="collapse"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="C"><xs:restriction base="xs:int"><xs:whiteSpace value="collapse"/></xs:restriction></xs:simpleType>`
        );
        expect(types).to.deep.equal([
            { kind: 'string', facets: { whiteSpace: 'replace' } },
            { kind: 'string', facets: { whiteSpace: 'collapse' } },
            { kind: 'int' },
        ]);
    });

    test('A fixed facet may be restated with its value', async () => {
        const types = await loadTypes(
            `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:maxLength value="3" fixed="1"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="B"><xs:restriction base="t:A"><xs:maxLength value="3"/><xs:pattern value="a+"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="C"><xs:restriction base="t:B"><xs:enumeration value="a"/></xs:restriction></xs:simpleType>`
        );
        expect(types.at(-1)).to.deep.equal({
            kind: 'string',
            facets: { maxLength: 3, pattern: 'a+', enumeration: ['a'] },
        });
    });

    test('An integer type keeps fractionDigits fixed to 0', async () => {
        const types = await loadTypes(
            `<xs:simpleType name="A"><xs:restriction base="xs:int"><xs:fractionDigits value="0"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="B"><xs:restriction base="t:A"><xs:maxInclusive value="5"/></xs:restriction></xs:simpleType>`
        );
        expect(types.at(-1)).to.deep.equal({
            kind: 'int',
            facets: { fractionDigits: 0, maxInclusive: 5 },
        });
    });

    test('Lists and unions, by name or anonymous type', async () => {
        const types = await loadTypes(
            `<xs:simpleType name="Ints"><xs:list itemType="xs:int"/></xs:simpleType>
            <xs:simpleType name="Sizes"><xs:list><xs:simpleType><xs:restriction base="xs:token"><xs:enumeration value="S"/></xs:restriction></xs:simpleType></xs:list></xs:simpleType>
            <xs:simpleType name="IntOrAuto"><xs:union memberTypes="xs:int t:Auto"><xs:simpleType><xs:restriction base="xs:boolean"/></xs:simpleType></xs:union></xs:simpleType>
            <xs:simpleType name="Auto"><xs:restriction base="xs:token"><xs:enumeration value="auto"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="Short"><xs:restriction base="t:Ints"><xs:maxLength value="2"/></xs:restriction></xs:simpleType>
            <xs:simpleType name="Inline"><xs:restriction><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType><xs:length value="1"/></xs:restriction></xs:simpleType>`
        );
        expect(types).to.deep.equal([
            { kind: 'list', item: { kind: 'int' } },
            { kind: 'list', item: { kind: 'token', facets: { enumeration: ['S'] } } },
            {
                kind: 'union',
                members: [
                    { kind: 'int' },
                    { kind: 'token', facets: { enumeration: ['auto'] } },
                    { kind: 'boolean' },
                ],
            },
            { kind: 'token', facets: { enumeration: ['auto'] } },
            { kind: 'list', item: { kind: 'int' }, facets: { maxLength: 2 } },
            { kind: 'string', facets: { length: 1 } },
        ]);
        expect((types[2] as { readonly members: readonly unknown[] }).members[1]).to.equal(
            types[3]
        );
    });
});
