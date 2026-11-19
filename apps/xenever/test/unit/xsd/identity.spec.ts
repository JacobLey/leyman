import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parse, XeneverValidationError } from 'xenever';
import { loadSchema } from './helpers.js';

const tns = 'targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified"';

const items = `<xs:complexType name="Items">
    <xs:sequence>
        <xs:element name="item" minOccurs="0" maxOccurs="unbounded">
            <xs:complexType><xs:attribute name="sku" type="xs:int"/></xs:complexType>
        </xs:element>
        <xs:element name="line" minOccurs="0" maxOccurs="unbounded">
            <xs:complexType><xs:attribute name="sku" type="xs:int"/></xs:complexType>
        </xs:element>
    </xs:sequence>
</xs:complexType>`;

suite('loadXsd identity constraints', () => {
    test('Reads key, unique and keyref with their namespace and the prefixes they use', async () => {
        const { elements } = await loadSchema(
            `<xs:element name="order" type="t:Items" xmlns:unused="urn:unused">
                <xs:key name="sku">
                    <xs:selector xpath=" t:item "/>
                    <xs:field xpath="@sku"/>
                </xs:key>
                <xs:unique name="line"><xs:selector xpath="t:line"/><xs:field xpath="@sku"/></xs:unique>
                <xs:keyref name="lineSku" refer="t:sku">
                    <xs:selector xpath="l:line" xmlns:l="urn:t"/>
                    <xs:field xpath="@sku"/>
                </xs:keyref>
            </xs:element>
            ${items}`,
            tns
        );
        expect(elements[0]!.identity).to.deep.equal([
            {
                kind: 'key',
                name: 'sku',
                namespace: 'urn:t',
                selector: 't:item',
                fields: ['@sku'],
                namespaces: { t: 'urn:t' },
            },
            {
                kind: 'unique',
                name: 'line',
                namespace: 'urn:t',
                selector: 't:line',
                fields: ['@sku'],
                namespaces: { t: 'urn:t' },
            },
            {
                kind: 'keyref',
                name: 'lineSku',
                namespace: 'urn:t',
                refer: { name: 'sku', namespace: 'urn:t' },
                selector: 'l:line',
                fields: ['@sku'],
                namespaces: { l: 'urn:t' },
            },
        ]);
    });

    test('Leaves out the namespaces of paths without prefixes', async () => {
        const { elements } = await loadSchema(
            `<xs:element name="order">
                <xs:complexType><xs:attribute name="id" type="xs:ID"/></xs:complexType>
                <xs:key name="id"><xs:selector xpath="."/><xs:field xpath="@id"/></xs:key>
            </xs:element>`
        );
        expect(elements[0]!.identity).to.deep.equal([
            { kind: 'key', name: 'id', selector: '.', fields: ['@id'] },
        ]);
    });

    test('Checks a document against them', async () => {
        const { elements } = await loadSchema(
            `<xs:element name="order" type="t:Items">
                <xs:key name="sku"><xs:selector xpath="t:item"/><xs:field xpath="@sku"/></xs:key>
                <xs:keyref name="lineSku" refer="t:sku">
                    <xs:selector xpath="t:line"/><xs:field xpath="@sku"/>
                </xs:keyref>
            </xs:element>
            ${items}`,
            tns
        );
        const order = elements[0]!;
        expect(() =>
            parse('<order xmlns="urn:t"><item sku="1"/><line sku="1"/></order>', order)
        ).not.to.throw();
        expect(() =>
            parse('<order xmlns="urn:t"><item sku="1"/><line sku="2"/></order>', order)
        ).to.throw(XeneverValidationError, /breaking keyref `lineSku` in `urn:t` of `\/order`/v);
    });

    test('Reads them on local elements, referring to a constraint declared later', async () => {
        const { elements } = await loadSchema(
            `<xs:element name="root">
                <xs:complexType>
                    <xs:sequence>
                        <xs:element name="order" type="Items">
                            <xs:keyref name="lineSku" refer="sku">
                                <xs:selector xpath="line"/><xs:field xpath="@sku"/>
                            </xs:keyref>
                            <xs:key name="sku"><xs:selector xpath="item"/><xs:field xpath="@sku"/></xs:key>
                        </xs:element>
                    </xs:sequence>
                </xs:complexType>
            </xs:element>
            ${items}`
        );
        expect(() =>
            parse('<root><order><item sku="1"/><line sku="2"/></order></root>', elements[0]!)
        ).to.throw(XeneverValidationError, /breaking keyref `lineSku` of `\/root\/order`/v);
    });

    test('A reference to a global element takes its constraints', async () => {
        const { elements } = await loadSchema(
            `<xs:element name="order" type="Items">
                <xs:key name="sku"><xs:selector xpath="item"/><xs:field xpath="@sku"/></xs:key>
            </xs:element>
            <xs:element name="orders">
                <xs:complexType>
                    <xs:sequence><xs:element ref="order" maxOccurs="unbounded"/></xs:sequence>
                </xs:complexType>
            </xs:element>
            ${items}`
        );
        expect(() =>
            parse('<orders><order><item sku="1"/><item sku="1"/></order></orders>', elements[1]!)
        ).to.throw(XeneverValidationError, /breaking key `sku` of `\/orders\/order`/v);
    });
});
