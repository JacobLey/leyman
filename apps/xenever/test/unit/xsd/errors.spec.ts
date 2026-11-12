import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { XeneverInvalidSchemaError, XeneverSchemaError, XeneverUnsupportedError } from 'xenever';
import { expectSchemaError, loadFiles, loadSchema, mainPath } from './helpers.js';

const tns = 'targetNamespace="urn:t" xmlns:t="urn:t"';

/**
 * Wraps attribute declarations in a global element's anonymous type.
 *
 * @param attributes - `xs:attribute`, `xs:attributeGroup` and `xs:anyAttribute` elements
 * @returns a global `xs:element` named `e`
 */
const withAttributes = (attributes: string): string =>
    `<xs:element name="e"><xs:complexType>${attributes}</xs:complexType></xs:element>`;

/**
 * Wraps particles in a global element's anonymous type, in a sequence.
 *
 * @param particles - `xs:element`, `xs:any` and model group elements
 * @returns a global `xs:element` named `e`
 */
const withParticles = (particles: string): string =>
    `<xs:element name="e"><xs:complexType><xs:sequence>${particles}</xs:sequence></xs:complexType></xs:element>`;

/**
 * Defines a named simple type.
 *
 * @param derivation - its restriction, list or union
 * @returns an `xs:simpleType` named `S`
 */
const simpleType = (derivation: string): string =>
    `<xs:simpleType name="S">${derivation}</xs:simpleType>`;

const base = `<xs:complexType name="Base">
    <xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence>
    <xs:attribute name="x" type="xs:string"/>
    <xs:attribute name="must" type="xs:string" use="required"/>
    <xs:attribute name="same" type="xs:string" fixed="v"/>
</xs:complexType>
<xs:complexType name="Text"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType>`;

/**
 * Restricts or extends `Base` with complex content.
 *
 * @param kind - restriction or extension
 * @param content - what the derivation holds
 * @param mixed - attributes of `xs:complexContent`
 * @returns the type
 */
const derive = (kind: 'extension' | 'restriction', content: string, mixed = ''): string =>
    `${base}<xs:complexType name="D"><xs:complexContent ${mixed}><xs:${kind} base="t:Base">${content}</xs:${kind}></xs:complexContent></xs:complexType>`;

const required = '<xs:attribute name="must" type="xs:string" use="required"/>';

type ErrorClass = typeof XeneverInvalidSchemaError | typeof XeneverUnsupportedError;

/**
 * Schemas that are invalid or unsupported: a name, the children of `xs:schema`, the error class, a match
 * for its message, and the attributes of `xs:schema` when not the target namespace `urn:t`.
 */
const cases: readonly (readonly [string, string, ErrorClass, RegExp, string?])[] = [
    // Reading XSD elements.
    [
        'an unsupported attribute',
        '<xs:element name="a" substitutionGroup="t:b"/>',
        XeneverUnsupportedError,
        /^Substitution groups are not supported/v,
    ],
    [
        'an unknown attribute',
        '<xs:element name="a" size="1"/>',
        XeneverInvalidSchemaError,
        /^Unknown attribute `size` on `xs:element`/v,
    ],
    [
        'an attribute in the XML Schema namespace',
        '<xs:element name="a" xs:type="xs:int"/>',
        XeneverInvalidSchemaError,
        /^Attributes in the XML Schema namespace are not allowed/v,
    ],
    [
        'text',
        '<xs:element name="a">text</xs:element>',
        XeneverInvalidSchemaError,
        /^Text is not allowed in `xs:element`/v,
    ],
    [
        'a foreign element',
        '<xs:element name="a"><t:b/></xs:element>',
        XeneverInvalidSchemaError,
        /^`t:b` is not allowed in `xs:element`/v,
    ],
    [
        'an id that is not an NCName',
        '<xs:element name="a" id="1a"/>',
        XeneverInvalidSchemaError,
        /^The id "1a" is not an NCName/v,
    ],
    [
        'an id used twice, on elements not otherwise read',
        '<xs:element name="a" id="i"><xs:annotation id="i"/></xs:element>',
        XeneverInvalidSchemaError,
        /^The id "i" is used twice in the file/v,
    ],
    [
        'elements of one name and type but different defaults in one content model',
        withParticles(
            '<xs:element name="a" type="xs:int" default="1"/><xs:element name="a" type="xs:int" default="2"/>'
        ),
        XeneverUnsupportedError,
        /^Element `a` is declared twice in one content model with the same type but otherwise differently, so its values can't share a key, and the XSD importer has no way to give them separate keys/v,
    ],
    [
        'elements of one local name in two namespaces in one content model',
        `<xs:element name="a" type="xs:int"/>${withParticles('<xs:element ref="t:a"/><xs:element name="a" type="xs:int"/>')}`,
        XeneverUnsupportedError,
        /^Key `a` is used by two elements in one content model/v,
    ],
    [
        'attributes of one local name in two namespaces',
        `<xs:attribute name="a" type="xs:int"/>${withAttributes('<xs:attribute ref="t:a"/><xs:attribute name="a" type="xs:int"/>')}`,
        XeneverUnsupportedError,
        /^Attribute key `a` is used twice/v,
    ],
    [
        'an unsupported element',
        '<xs:element name="a"><xs:key name="k"/></xs:element>',
        XeneverUnsupportedError,
        /^Identity constraints \(`xs:key`\) are not supported/v,
    ],
    [
        'xs:redefine',
        '<xs:redefine schemaLocation="a.xsd"/>',
        XeneverUnsupportedError,
        /^`xs:redefine` is not supported/v,
    ],
    [
        'a missing child, at the end',
        simpleType(''),
        XeneverInvalidSchemaError,
        /^`xs:simpleType` is missing `xs:restriction`, `xs:list` or `xs:union`/v,
    ],
    [
        'a missing child, before another',
        simpleType('<xs:annotation/><xs:annotation/>'),
        XeneverInvalidSchemaError,
        /^`xs:simpleType` is missing `xs:restriction`, `xs:list` or `xs:union`/v,
    ],
    [
        'an annotation in an annotation',
        '<xs:annotation><xs:annotation/></xs:annotation>',
        XeneverInvalidSchemaError,
        /^`xs:annotation` is not allowed here in `xs:annotation`/v,
    ],
    [
        'an unknown attribute on xs:documentation',
        '<xs:annotation><xs:documentation lang="en"/></xs:annotation>',
        XeneverInvalidSchemaError,
        /^Unknown attribute `lang` on `xs:documentation`/v,
    ],
    [
        'a bad boolean',
        '<xs:element name="a" nillable="yes"/>',
        XeneverInvalidSchemaError,
        /^`nillable` must be `true`, `false`, `1` or `0`/v,
    ],
    [
        'a negative count',
        withParticles('<xs:element name="a" minOccurs="-1"/>'),
        XeneverInvalidSchemaError,
        /^`minOccurs` must be a non-negative integer/v,
    ],
    [
        'a count past the safe integers',
        withParticles('<xs:element name="a" maxOccurs="9007199254740992"/>'),
        XeneverUnsupportedError,
        /^`maxOccurs` past 9007199254740991 is not supported/v,
    ],
    [
        'maxOccurs below minOccurs',
        withParticles('<xs:element name="a" minOccurs="2" maxOccurs="1"/>'),
        XeneverInvalidSchemaError,
        /^`maxOccurs` is less than `minOccurs`/v,
    ],
    [
        'a QName that is not one',
        '<xs:element name="a" type="t:b:c"/>',
        XeneverInvalidSchemaError,
        /^"t:b:c" is not a QName/v,
    ],
    [
        'a QName with an empty prefix',
        '<xs:element name="a" type=":b"/>',
        XeneverInvalidSchemaError,
        /^":b" is not a QName/v,
    ],
    [
        'an undeclared prefix',
        '<xs:element name="a" type="p:b"/>',
        XeneverInvalidSchemaError,
        /^The prefix of "p:b" is not declared/v,
    ],
    [
        'a namespace neither targeted nor imported',
        '<xs:element name="a" type="u:b" xmlns:u="urn:u"/>',
        XeneverInvalidSchemaError,
        /^"u:b" is in `urn:u`, which this schema neither targets nor imports/v,
    ],
    [
        'no namespace, not imported',
        '<xs:element name="a" type="b" xmlns=""/>',
        XeneverInvalidSchemaError,
        /^"b" is in no namespace, which this schema neither targets nor imports/v,
    ],

    // Simple types.
    [
        'length with minLength in one step',
        simpleType(
            '<xs:restriction base="xs:string"><xs:length value="2"/><xs:minLength value="1"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^`length` can not be combined with `minLength` or `maxLength` in one restriction/v,
    ],
    [
        "length with a minLength other than the base type's",
        simpleType(
            '<xs:restriction base="xs:IDREFS"><xs:length value="2"/><xs:minLength value="2"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^`length` can not be combined with `minLength` or `maxLength` in one restriction/v,
    ],
    [
        'length with a repeated maxLength of a base type with a length',
        `<xs:simpleType name="L"><xs:restriction base="xs:string"><xs:length value="2"/></xs:restriction></xs:simpleType>${simpleType(
            '<xs:restriction base="t:L"><xs:length value="2"/><xs:maxLength value="2"/></xs:restriction>'
        )}`,
        XeneverInvalidSchemaError,
        /^`length` can not be combined with `minLength` or `maxLength` in one restriction/v,
    ],
    [
        'minLength above maxLength',
        simpleType(
            '<xs:restriction base="xs:string"><xs:minLength value="3"/><xs:maxLength value="2"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^`minLength` is greater than `maxLength`/v,
    ],
    [
        'minInclusive above maxInclusive',
        simpleType(
            '<xs:restriction base="xs:decimal"><xs:minInclusive value="2.5"/><xs:maxInclusive value="2"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^`minInclusive` 2\.5 must be at most `maxInclusive` 2/v,
    ],
    [
        'fractionDigits above totalDigits',
        simpleType(
            '<xs:restriction base="xs:decimal"><xs:totalDigits value="2"/><xs:fractionDigits value="3"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^`fractionDigits` is greater than `totalDigits`/v,
    ],
    [
        'a length outside the base lengths',
        `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:maxLength value="3"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:length value="4"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`length` is outside the lengths of the base type/v,
    ],
    [
        'a length other than the base length',
        `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:length value="3"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:length value="2"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`length` is outside the lengths of the base type/v,
    ],
    [
        'a looser minLength',
        `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:minLength value="3"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:minLength value="2"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`minLength` is outside the lengths of the base type/v,
    ],
    [
        'a minLength past the base length',
        `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:length value="3"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:minLength value="4"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`minLength` is outside the lengths of the base type/v,
    ],
    [
        'a looser maxLength',
        `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:maxLength value="3"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:maxLength value="4"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`maxLength` is outside the lengths of the base type/v,
    ],
    [
        'a maxLength below the base length',
        `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:length value="3"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:maxLength value="2"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`maxLength` is outside the lengths of the base type/v,
    ],
    [
        'more digits than the base',
        `<xs:simpleType name="A"><xs:restriction base="xs:decimal"><xs:fractionDigits value="2"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:fractionDigits value="3"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`fractionDigits` is outside the digits of the base type/v,
    ],
    [
        'a looser whiteSpace on a string',
        `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:whiteSpace value="replace"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:whiteSpace value="preserve"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`whiteSpace` can not loosen the base type's `replace`/v,
    ],
    [
        'a looser whiteSpace on a token',
        simpleType(
            '<xs:restriction base="xs:token"><xs:whiteSpace value="replace"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^`whiteSpace` can not loosen the base type's `collapse`/v,
    ],
    [
        'a looser whiteSpace on a number',
        simpleType(
            '<xs:restriction base="xs:int"><xs:whiteSpace value="preserve"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^`whiteSpace` can not loosen the base type's `collapse`/v,
    ],
    [
        'a whiteSpace on a union',
        `<xs:simpleType name="U"><xs:union memberTypes="xs:int xs:string"/></xs:simpleType>
        ${simpleType('<xs:restriction base="t:U"><xs:whiteSpace value="collapse"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^The facet `whiteSpace` doesn't apply to this type/v,
    ],
    [
        'a changed fixed facet',
        `<xs:simpleType name="A"><xs:restriction base="xs:string"><xs:maxLength value="3" fixed="true"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:maxLength value="2"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`maxLength` is fixed by the base type/v,
    ],
    [
        'fractionDigits on an integer type',
        `<xs:simpleType name="A"><xs:restriction base="xs:long"/></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:fractionDigits value="1"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`fractionDigits` is fixed by the base type/v,
    ],
    [
        'an enumeration invalid for the base',
        simpleType('<xs:restriction base="xs:int"><xs:enumeration value="x"/></xs:restriction>'),
        XeneverInvalidSchemaError,
        /^`enumeration` is not valid for the base type: /v,
    ],
    [
        'a range bound invalid for the base',
        `<xs:simpleType name="A"><xs:restriction base="xs:int"><xs:maxInclusive value="10"/></xs:restriction></xs:simpleType>
        ${simpleType('<xs:restriction base="t:A"><xs:minInclusive value="11"/></xs:restriction>')}`,
        XeneverInvalidSchemaError,
        /^`minInclusive` is not valid for the base type: /v,
    ],
    [
        'an enumeration of QNames',
        simpleType(
            '<xs:restriction base="xs:QName"><xs:enumeration value="t:a"/></xs:restriction>'
        ),
        XeneverUnsupportedError,
        /^The facet `enumeration` is not supported on this type/v,
    ],
    [
        'a facet twice',
        simpleType(
            '<xs:restriction base="xs:string"><xs:maxLength value="2"/><xs:maxLength value="3"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^`xs:maxLength` may occur only once in a restriction/v,
    ],
    [
        'a facet without a value',
        simpleType('<xs:restriction base="xs:string"><xs:pattern/></xs:restriction>'),
        XeneverInvalidSchemaError,
        /^`xs:pattern` is missing the attribute `value`/v,
    ],
    [
        'fixed on a pattern',
        simpleType(
            '<xs:restriction base="xs:string"><xs:pattern value="a" fixed="true"/></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^Unknown attribute `fixed` on `xs:pattern`/v,
    ],
    [
        'an invalid pattern',
        simpleType('<xs:restriction base="xs:string"><xs:pattern value="(a"/></xs:restriction>'),
        XeneverInvalidSchemaError,
        /^Pattern "\(a" ends early/v,
    ],
    [
        'a restriction with both a base and a type',
        simpleType(
            '<xs:restriction base="xs:string"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:restriction>'
        ),
        XeneverInvalidSchemaError,
        /^A restriction has either a `base` or an `xs:simpleType`, one of them/v,
    ],
    [
        'a restriction with neither a base nor a type',
        simpleType('<xs:restriction/>'),
        XeneverInvalidSchemaError,
        /^A restriction has either a `base` or an `xs:simpleType`, one of them/v,
    ],
    [
        'a restriction of anySimpleType',
        simpleType('<xs:restriction base="xs:anySimpleType"/>'),
        XeneverInvalidSchemaError,
        /^Only a built-in type may restrict `xs:anySimpleType`/v,
    ],
    [
        'a list with both an item type and a type',
        simpleType(
            '<xs:list itemType="xs:int"><xs:simpleType><xs:restriction base="xs:int"/></xs:simpleType></xs:list>'
        ),
        XeneverInvalidSchemaError,
        /^A list has either an `itemType` or an `xs:simpleType`, one of them/v,
    ],
    [
        'a list of lists',
        `<xs:simpleType name="L"><xs:list itemType="xs:int"/></xs:simpleType>${simpleType('<xs:list itemType="t:L"/>')}`,
        XeneverInvalidSchemaError,
        /list/v,
    ],
    [
        'a union without members',
        simpleType('<xs:union/>'),
        XeneverInvalidSchemaError,
        /^A union needs at least one member type/v,
    ],
    [
        'a union with empty member types',
        simpleType('<xs:union memberTypes=" "/>'),
        XeneverInvalidSchemaError,
        /^A union needs at least one member type/v,
    ],
    [
        'a simple type naming a complex type',
        `<xs:complexType name="C"/>${simpleType('<xs:list itemType="t:C"/>')}`,
        XeneverInvalidSchemaError,
        /^"t:C" is not a simple type/v,
    ],
    [
        'a union member naming a complex type',
        `<xs:complexType name="C"/>${simpleType('<xs:union memberTypes="xs:int t:C"/>')}`,
        XeneverInvalidSchemaError,
        /^"t:C" is not a simple type/v,
    ],
    [
        'a simple type defined in terms of itself',
        simpleType('<xs:restriction base="t:S"/>'),
        XeneverInvalidSchemaError,
        /^A simple type is defined in terms of itself/v,
    ],
    [
        'a simple type with final',
        simpleType('<xs:restriction base="xs:string"/>').replace(
            'name="S"',
            'name="S" final="all"'
        ),
        XeneverInvalidSchemaError,
        /^`final` must be `#all` or a list of `list`, `union`, `restriction` and `extension`/v,
    ],

    // Built-in and named types.
    [
        'NOTATION',
        '<xs:attribute name="a" type="xs:NOTATION"/>',
        XeneverUnsupportedError,
        /^Notations are not supported/v,
    ],
    [
        'an XSD 1.1 type',
        '<xs:element name="a" type="xs:dateTimeStamp"/>',
        XeneverUnsupportedError,
        /^`xs:dateTimeStamp` \(XSD 1\.1\) is not supported/v,
    ],
    [
        'an unknown built-in type',
        '<xs:element name="a" type="xs:text"/>',
        XeneverInvalidSchemaError,
        /^`xs:text` is not a built-in type/v,
    ],
    [
        'an undefined type',
        '<xs:element name="a" type="t:Missing"/>',
        XeneverInvalidSchemaError,
        /^Type \{urn:t\}Missing is not defined/v,
    ],
    [
        'a type deriving from itself',
        '<xs:complexType name="A"><xs:complexContent><xs:extension base="t:A"/></xs:complexContent></xs:complexType>',
        XeneverInvalidSchemaError,
        /^Type \{urn:t\}A derives from itself/v,
    ],

    // Elements.
    [
        'an element with a type and an anonymous type',
        '<xs:element name="a" type="xs:string"><xs:complexType/></xs:element>',
        XeneverInvalidSchemaError,
        /^An element has either a `type` or an anonymous type, not both/v,
    ],
    [
        'an abstract element',
        '<xs:element name="a" abstract="true"/>',
        XeneverUnsupportedError,
        /^Abstract elements are not supported/v,
    ],
    [
        'an element with default and fixed',
        '<xs:element name="a" type="xs:string" default="a" fixed="a"/>',
        XeneverInvalidSchemaError,
        /^A declaration has either `default` or `fixed`, not both/v,
    ],
    [
        'a default invalid for the type',
        '<xs:element name="a" type="xs:int" default="x"/>',
        XeneverInvalidSchemaError,
        /default/v,
    ],
    [
        'a local element with a name and a ref',
        withParticles('<xs:element name="a" ref="t:a"/>'),
        XeneverInvalidSchemaError,
        /^A local element has either a `name` or a `ref`, one of them/v,
    ],
    [
        'a local element with neither a name nor a ref',
        withParticles('<xs:element/>'),
        XeneverInvalidSchemaError,
        /^A local element has either a `name` or a `ref`, one of them/v,
    ],
    [
        'a bad block on a local element',
        withParticles('<xs:element name="a" block="list"/>'),
        XeneverInvalidSchemaError,
        /^`block` must be `#all` or a list of `extension`, `restriction` and `substitution`/v,
    ],
    [
        'a bad form',
        withParticles('<xs:element name="a" form="local"/>'),
        XeneverInvalidSchemaError,
        /^`form` must be `qualified` or `unqualified`/v,
    ],
    [
        'an element reference with a type',
        `<xs:element name="a"/>${withParticles('<xs:element ref="t:a" type="xs:string"/>')}`,
        XeneverInvalidSchemaError,
        /^An element reference can not have `type`/v,
    ],
    [
        'an element reference with an anonymous type',
        `<xs:element name="a"/>${withParticles('<xs:element ref="t:a"><xs:complexType/></xs:element>')}`,
        XeneverInvalidSchemaError,
        /^An element reference can not have an anonymous type/v,
    ],
    [
        'an undeclared element reference',
        withParticles('<xs:element ref="t:missing"/>'),
        XeneverInvalidSchemaError,
        /^Element \{urn:t\}missing is not declared/v,
    ],

    // Attributes.
    [
        'an attribute named xmlns',
        withAttributes('<xs:attribute name="xmlns"/>'),
        XeneverInvalidSchemaError,
        /^An attribute can not be named `xmlns`/v,
    ],
    [
        'an attribute with a type and an anonymous type',
        withAttributes(
            '<xs:attribute name="a" type="xs:string"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:attribute>'
        ),
        XeneverInvalidSchemaError,
        /^An attribute has either a `type` or an anonymous type, not both/v,
    ],
    [
        'an attribute of a complex type',
        `<xs:complexType name="C"/>${withAttributes('<xs:attribute name="a" type="t:C"/>')}`,
        XeneverInvalidSchemaError,
        /^"t:C" is not a simple type/v,
    ],
    [
        'a local attribute with a name and a ref',
        withAttributes('<xs:attribute name="a" ref="t:a"/>'),
        XeneverInvalidSchemaError,
        /^A local attribute has either a `name` or a `ref`, one of them/v,
    ],
    [
        'a required attribute with a default',
        withAttributes('<xs:attribute name="a" use="required" default="x"/>'),
        XeneverInvalidSchemaError,
        /^An attribute with a `default` must be optional/v,
    ],
    [
        'a bad use',
        withAttributes('<xs:attribute name="a" use="always"/>'),
        XeneverInvalidSchemaError,
        /^`use` must be `optional`, `required` or `prohibited`/v,
    ],
    [
        'an attribute reference with a form',
        `<xs:attribute name="a"/>${withAttributes('<xs:attribute ref="t:a" form="qualified"/>')}`,
        XeneverInvalidSchemaError,
        /^An attribute reference can not have `form`/v,
    ],
    [
        'an attribute reference with an anonymous type',
        `<xs:attribute name="a"/>${withAttributes('<xs:attribute ref="t:a"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:attribute>')}`,
        XeneverInvalidSchemaError,
        /^An attribute reference can not have an anonymous type/v,
    ],
    [
        'an undeclared attribute reference',
        withAttributes('<xs:attribute ref="t:missing"/>'),
        XeneverInvalidSchemaError,
        /^Attribute \{urn:t\}missing is not declared/v,
    ],
    [
        'a reference changing a fixed value',
        `<xs:attribute name="a" fixed="1"/>${withAttributes('<xs:attribute ref="t:a" fixed="2"/>')}`,
        XeneverInvalidSchemaError,
        /^Attribute \{urn:t\}a is fixed to "1" by its declaration/v,
    ],
    [
        'a reference giving a fixed attribute a default',
        `<xs:attribute name="a" fixed="1"/>${withAttributes('<xs:attribute ref="t:a" default="1"/>')}`,
        XeneverInvalidSchemaError,
        /^Attribute \{urn:t\}a is fixed to "1" by its declaration/v,
    ],
    [
        'an attribute declared twice',
        withAttributes('<xs:attribute name="a"/><xs:attribute name="a"/>'),
        XeneverInvalidSchemaError,
        /^Attribute a is declared twice/v,
    ],
    [
        'an attribute declared twice through a group',
        `<xs:attributeGroup name="g"><xs:attribute name="a"/></xs:attributeGroup>
        ${withAttributes('<xs:attribute name="a"/><xs:attributeGroup ref="t:g"/>')}`,
        XeneverInvalidSchemaError,
        /^Attribute a is declared twice/v,
    ],
    [
        'an attribute in the xsi namespace',
        '<xs:attribute name="type"/>',
        XeneverInvalidSchemaError,
        /^The `xsi` namespace has no attributes but those XML Schema defines/v,
        'targetNamespace="http://www.w3.org/2001/XMLSchema-instance"',
    ],
    [
        'an undefined attribute group',
        withAttributes('<xs:attributeGroup ref="t:missing"/>'),
        XeneverInvalidSchemaError,
        /^Attribute group \{urn:t\}missing is not defined/v,
    ],
    [
        'an attribute group referring to itself',
        `<xs:attributeGroup name="g"><xs:attributeGroup ref="t:g"/></xs:attributeGroup>${withAttributes('<xs:attributeGroup ref="t:g"/>')}`,
        XeneverInvalidSchemaError,
        /^An attribute group refers to itself/v,
    ],
    [
        'an attribute wildcard allowing nothing',
        withAttributes('<xs:anyAttribute namespace=""/>'),
        XeneverUnsupportedError,
        /^A wildcard that allows no namespace is not supported/v,
    ],
    [
        'disjoint attribute wildcards',
        `<xs:attributeGroup name="g"><xs:anyAttribute namespace="urn:a"/></xs:attributeGroup>
        ${withAttributes('<xs:attributeGroup ref="t:g"/><xs:anyAttribute namespace="urn:b"/>')}`,
        XeneverUnsupportedError,
        /^A wildcard that allows no namespace is not supported/v,
    ],
    [
        'a keyword in a list of namespaces',
        withAttributes('<xs:anyAttribute namespace="urn:a ##other"/>'),
        XeneverInvalidSchemaError,
        /^`##other` can not be in a list of namespaces/v,
    ],
    [
        'a bad processContents',
        withAttributes('<xs:anyAttribute processContents="none"/>'),
        XeneverInvalidSchemaError,
        /^`processContents` must be `skip`, `lax` or `strict`/v,
    ],

    // Model groups.
    [
        'an element wildcard allowing nothing',
        withParticles('<xs:any namespace=""/>'),
        XeneverUnsupportedError,
        /^A wildcard that allows no namespace is not supported/v,
    ],
    [
        'an xs:all occurring more than once',
        '<xs:element name="e"><xs:complexType><xs:all maxOccurs="2"/></xs:complexType></xs:element>',
        XeneverInvalidSchemaError,
        /^An `xs:all` occurs at most once/v,
    ],
    [
        'an xs:all that never occurs',
        '<xs:element name="e"><xs:complexType><xs:all minOccurs="0" maxOccurs="0"/></xs:complexType></xs:element>',
        XeneverInvalidSchemaError,
        /^An `xs:all` occurs at most once/v,
    ],
    [
        'a wildcard in xs:all',
        '<xs:element name="e"><xs:complexType><xs:all><xs:any/></xs:all></xs:complexType></xs:element>',
        XeneverUnsupportedError,
        /^`xs:any` in `xs:all` \(XSD 1\.1\) is not supported/v,
    ],
    [
        'a repeated element in xs:all',
        '<xs:element name="e"><xs:complexType><xs:all><xs:element name="a" maxOccurs="2"/></xs:all></xs:complexType></xs:element>',
        XeneverUnsupportedError,
        /^An element that occurs more than once in `xs:all` \(XSD 1\.1\) is not supported/v,
    ],
    [
        'an undefined group',
        withParticles('<xs:group ref="t:missing"/>'),
        XeneverInvalidSchemaError,
        /^Group \{urn:t\}missing is not defined/v,
    ],
    [
        'a group of xs:all in a sequence',
        `<xs:group name="g"><xs:all/></xs:group>${withParticles('<xs:group ref="t:g"/>')}`,
        XeneverInvalidSchemaError,
        /^A group of `xs:all` can only be the whole content of a type/v,
    ],
    [
        'a group of xs:all occurring more than once',
        '<xs:group name="g"><xs:all/></xs:group><xs:complexType name="C"><xs:group ref="t:g" maxOccurs="2"/></xs:complexType>',
        XeneverInvalidSchemaError,
        /^An `xs:all` occurs at most once/v,
    ],
    [
        'a group referring to itself',
        `<xs:group name="g"><xs:sequence><xs:group ref="t:g"/></xs:sequence></xs:group>${withParticles('<xs:group ref="t:g"/>')}`,
        XeneverInvalidSchemaError,
        /^A group refers to itself/v,
    ],
    [
        'a group with occurrences on its model group',
        '<xs:group name="g"><xs:sequence minOccurs="0"/></xs:group>',
        XeneverInvalidSchemaError,
        /^Unknown attribute `minOccurs` on `xs:sequence`/v,
    ],
    [
        'conflicting particles',
        withParticles(
            '<xs:element name="a" type="xs:int"/><xs:element name="a" type="xs:string"/>'
        ),
        XeneverInvalidSchemaError,
        /a/v,
    ],

    // Complex types.
    [
        'an abstract type',
        '<xs:complexType name="C" abstract="1"/>',
        XeneverUnsupportedError,
        /^Abstract types are not supported/v,
    ],
    [
        'a bad final on a type',
        '<xs:complexType name="C" final="list"/>',
        XeneverInvalidSchemaError,
        /^`final` must be `#all` or a list of `extension` and `restriction`/v,
    ],
    [
        'an extension of a type final for extension',
        '<xs:complexType name="F" final="extension"/><xs:complexType name="C"><xs:complexContent><xs:extension base="t:F"/></xs:complexContent></xs:complexType>',
        XeneverInvalidSchemaError,
        /^Type \{urn:t\}F is final for extension/v,
    ],
    [
        'a restriction of a type its file makes final',
        '<xs:complexType name="F"/><xs:complexType name="C"><xs:complexContent><xs:restriction base="t:F"/></xs:complexContent></xs:complexType>',
        XeneverInvalidSchemaError,
        /^Type \{urn:t\}F is final for restriction/v,
        `${tns} finalDefault="restriction"`,
    ],
    [
        'a simple content restriction of a type final for all',
        '<xs:complexType name="F" final="#all"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType><xs:complexType name="C"><xs:simpleContent><xs:restriction base="t:F"/></xs:simpleContent></xs:complexType>',
        XeneverInvalidSchemaError,
        /^Type \{urn:t\}F is final for restriction/v,
    ],
    [
        'a restriction of a simple type final for restriction',
        '<xs:simpleType name="F" final="restriction"><xs:restriction base="xs:string"/></xs:simpleType><xs:simpleType name="S"><xs:restriction base="t:F"/></xs:simpleType>',
        XeneverInvalidSchemaError,
        /^Type \{urn:t\}F is final for restriction/v,
    ],
    [
        'a list of a simple type final for list',
        '<xs:simpleType name="F" final="#all"><xs:restriction base="xs:string"/></xs:simpleType><xs:simpleType name="S"><xs:list itemType="t:F"/></xs:simpleType>',
        XeneverInvalidSchemaError,
        /^Type \{urn:t\}F is final for list/v,
    ],
    [
        'a union of a simple type its file makes final for union',
        '<xs:simpleType name="F"><xs:restriction base="xs:string"/></xs:simpleType><xs:simpleType name="S"><xs:union memberTypes="xs:int t:F"/></xs:simpleType>',
        XeneverInvalidSchemaError,
        /^Type \{urn:t\}F is final for union/v,
        `${tns} finalDefault="list union"`,
    ],
    [
        'attributes after simple content',
        '<xs:complexType name="C"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent><xs:attribute name="a"/></xs:complexType>',
        XeneverInvalidSchemaError,
        /^`xs:attribute` can not follow `xs:simpleContent`/v,
    ],
    [
        'mixed simple content',
        '<xs:complexType name="C" mixed="true"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType>',
        XeneverInvalidSchemaError,
        /^A type with simple content can not be mixed/v,
    ],
    [
        'complex content from a simple type',
        '<xs:complexType name="C"><xs:complexContent><xs:extension base="xs:int"/></xs:complexContent></xs:complexType>',
        XeneverInvalidSchemaError,
        /^Complex content derives from a complex type without simple content/v,
    ],
    [
        'complex content from simple content',
        `${base}<xs:complexType name="C"><xs:complexContent><xs:extension base="t:Text"/></xs:complexContent></xs:complexType>`,
        XeneverInvalidSchemaError,
        /^Complex content derives from a complex type without simple content/v,
    ],
    [
        'a derivation without a base',
        '<xs:complexType name="C"><xs:complexContent><xs:extension/></xs:complexContent></xs:complexType>',
        XeneverInvalidSchemaError,
        /^`xs:extension` is missing the attribute `base`/v,
    ],
    [
        'a mixed restriction of an element-only type',
        derive('restriction', required, 'mixed="true"'),
        XeneverInvalidSchemaError,
        /^A restriction of a type without mixed content can not be mixed/v,
    ],
    [
        'a restriction prohibiting a required attribute',
        derive('restriction', '<xs:attribute name="must" use="prohibited"/>'),
        XeneverInvalidSchemaError,
        /^Attribute must is required by the base type/v,
    ],
    [
        'a restriction making a required attribute optional',
        derive('restriction', '<xs:attribute name="must" type="xs:string"/>'),
        XeneverInvalidSchemaError,
        /^Attribute must is required by the base type/v,
    ],
    [
        'a restriction changing a fixed attribute',
        derive('restriction', `${required}<xs:attribute name="same" fixed="w"/>`),
        XeneverInvalidSchemaError,
        /^Attribute same is fixed to "v" by the base type/v,
    ],
    [
        'a restriction dropping the fixed value of an attribute',
        derive('restriction', `${required}<xs:attribute name="same"/>`),
        XeneverInvalidSchemaError,
        /^Attribute same is fixed to "v" by the base type/v,
    ],
    [
        'a restriction fixing an attribute to a value not of its type',
        derive('restriction', `${required}<xs:attribute name="same" fixed=" v "/>`).replace(
            'name="same" type="xs:string"',
            'name="same" type="xs:int"'
        ),
        XeneverInvalidSchemaError,
        /^Attribute same is fixed to "v" by the base type/v,
    ],
    [
        'a restriction of a fixed QName attribute',
        derive(
            'restriction',
            `${required}<xs:attribute name="same" type="xs:QName" fixed="v"/>`
        ).replace('name="same" type="xs:string"', 'name="same" type="xs:QName"'),
        XeneverUnsupportedError,
        /^`fixed` of a type that may be a QName is not supported/v,
    ],
    [
        'a restriction adding an attribute without a wildcard',
        derive('restriction', `${required}<xs:attribute name="new"/>`),
        XeneverInvalidSchemaError,
        /^Attribute new is neither declared nor allowed by a wildcard in the base type/v,
    ],
    [
        'a restriction adding a wildcard',
        derive('restriction', `${required}<xs:anyAttribute/>`),
        XeneverInvalidSchemaError,
        /^A restriction can only have an attribute wildcard if its base type has one/v,
    ],
    [
        'a restriction adding an attribute its base wildcard excludes',
        `<xs:complexType name="W"><xs:anyAttribute namespace="##other"/></xs:complexType>
        <xs:complexType name="D"><xs:complexContent><xs:restriction base="t:W"><xs:attribute name="local"/></xs:restriction></xs:complexContent></xs:complexType>`,
        XeneverInvalidSchemaError,
        /^Attribute local is neither declared nor allowed by a wildcard in the base type/v,
    ],
    [
        'an extension redeclaring an attribute',
        derive('extension', '<xs:attribute name="x"/>'),
        XeneverInvalidSchemaError,
        /^Attribute x is already declared by the base type/v,
    ],
    [
        'a mixed extension of an element-only type',
        derive('extension', '<xs:sequence><xs:element name="b"/></xs:sequence>', 'mixed="true"'),
        XeneverInvalidSchemaError,
        /^An extension of a type with content is mixed exactly when its base type is/v,
    ],
    [
        'an extension adding an xs:all',
        derive('extension', '<xs:all><xs:element name="b"/></xs:all>'),
        XeneverInvalidSchemaError,
        /^An extension can neither extend nor add an `xs:all`/v,
    ],
    [
        'a simple content extension of element-only content',
        `${base}<xs:complexType name="C"><xs:simpleContent><xs:extension base="t:Base"/></xs:simpleContent></xs:complexType>`,
        XeneverInvalidSchemaError,
        /^A simple content extension derives from a simple type or a type with simple content/v,
    ],
    [
        'a simple content restriction of a simple type',
        '<xs:complexType name="C"><xs:simpleContent><xs:restriction base="xs:string"/></xs:simpleContent></xs:complexType>',
        XeneverInvalidSchemaError,
        /^A simple content restriction derives from a type with simple content/v,
    ],
    [
        'a simple content restriction of element-only content',
        `${base}<xs:complexType name="C"><xs:simpleContent><xs:restriction base="t:Base"/></xs:simpleContent></xs:complexType>`,
        XeneverInvalidSchemaError,
        /^A simple content restriction derives from a type with simple content/v,
    ],
];

suite('loadXsd errors', () => {
    for (const [name, body, errorClass, reason, attributes = tns] of cases) {
        test(`Rejects ${name}`, async () => {
            await expectSchemaError(loadSchema(body, attributes), errorClass, reason, {
                filePath: mainPath,
            });
        });
    }

    test('Names XSD elements as written, unprefixed in the default namespace', async () => {
        const unprefixed = 'xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:t"';
        await expectSchemaError(
            loadFiles({
                [mainPath]: `<schema ${unprefixed}><element name="a">text</element></schema>`,
            }),
            XeneverInvalidSchemaError,
            /^Text is not allowed in `element`/v
        );
        await expectSchemaError(
            loadFiles({
                [mainPath]: `<schema ${unprefixed}><simpleType name="S"><restriction base="anySimpleType"/></simpleType></schema>`,
            }),
            XeneverInvalidSchemaError,
            /^Only a built-in type may restrict `xs:anySimpleType`/v
        );
    });

    test('Locates an error at the attribute that is wrong', async () => {
        const error = await expectSchemaError(
            loadSchema('\n<xs:element name="a"\n    nillable="no"/>', tns),
            XeneverInvalidSchemaError,
            /^`nillable` must be/v,
            {
                filePath: mainPath,
                line: 3,
                column: 5,
                path: '/xs:schema/xs:element/@nillable',
            }
        );
        expect(error.message).to.match(
            / \(at \/xs:schema\/xs:element\/@nillable in \/schemas\/main\.xsd, line 3, column 5\)$/v
        );
    });

    test('Locates an error found when checking the schema at the construct it is about', async () => {
        const error = await expectSchemaError(
            loadSchema(
                `<xs:element name="tree" type="t:Node"/>
                <xs:complexType name="Node"><xs:sequence>
                    <xs:element name="node" type="t:Node" minOccurs="0" nillable="true"/>
                    <xs:element name="pattern"><xs:simpleType><xs:restriction base="xs:string"><xs:pattern value="[a"/></xs:restriction></xs:simpleType></xs:element>
                </xs:sequence></xs:complexType>`,
                tns
            ),
            XeneverSchemaError,
            /./v,
            {
                filePath: mainPath,
                line: 4,
                path: '/xs:schema/xs:complexType/xs:sequence/xs:element[2]/xs:simpleType/xs:restriction',
            }
        );
        expect(error.cause).to.be.instanceOf(XeneverSchemaError);
    });

    test('Locates bounds out of order at the restriction', async () => {
        await expectSchemaError(
            loadSchema(
                `<xs:simpleType name="A"><xs:restriction base="xs:int"><xs:maxInclusive value="5"/></xs:restriction></xs:simpleType>
                <xs:simpleType name="B">
                    <xs:restriction base="t:A"><xs:minExclusive value="5"/></xs:restriction>
                </xs:simpleType>`,
                tns
            ),
            XeneverInvalidSchemaError,
            /^`minExclusive` 5 must be less than `maxInclusive` 5/v,
            {
                filePath: mainPath,
                line: 3,
                path: '/xs:schema/xs:simpleType[2]/xs:restriction',
            }
        );
    });

    test('Locates an error behind a lazy reference', async () => {
        await expectSchemaError(
            loadSchema(
                `<xs:element name="tree" type="t:Node"/>
                <xs:complexType name="Node"><xs:sequence>
                    <xs:element name="node" type="t:Node" minOccurs="0" default="x"/>
                </xs:sequence></xs:complexType>`,
                tns
            ),
            XeneverInvalidSchemaError,
            /./v,
            {
                filePath: mainPath,
                line: 3,
                path: '/xs:schema/xs:complexType/xs:sequence/xs:element',
            }
        );
    });

    test('Checks named types no element uses', async () => {
        await expectSchemaError(
            loadSchema(
                '<xs:complexType name="C"><xs:sequence><xs:element name="a" type="xs:int"/><xs:element name="a" type="xs:string"/></xs:sequence></xs:complexType>',
                tns
            ),
            XeneverInvalidSchemaError,
            /./v,
            { filePath: mainPath }
        );
    });

    test('Checks global attributes no type uses', async () => {
        await expectSchemaError(
            loadSchema(
                '<xs:simpleType name="Id"><xs:restriction base="xs:ID"/></xs:simpleType><xs:attribute name="a" type="t:Id" default="i"/>',
                tns
            ),
            XeneverInvalidSchemaError,
            /^An `ID` can not have a `default`/v,
            { filePath: mainPath, path: '/xs:schema/xs:attribute' }
        );
    });
});
