import type { x } from 'xenever';
import type { XsdElement, XsdNamedType, XsdSchemaSet } from 'xenever/xsd';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';
import { parse } from 'xenever';
import { loadXsd } from 'xenever/xsd';
import { loadSchema } from './helpers.js';

suite('loadXsd types of the API', () => {
    test('Resolves to the schema set', () => {
        expectTypeOf(loadXsd).returns.resolves.toEqualTypeOf<XsdSchemaSet>();
        expectTypeOf<XsdSchemaSet['elements']>().toEqualTypeOf<readonly XsdElement[]>();
        expectTypeOf<XsdSchemaSet['types']>().toEqualTypeOf<readonly XsdNamedType[]>();
        expectTypeOf<XsdNamedType['type']>().toEqualTypeOf<x.Type>();
    });

    test('Elements are IR elements with Standard Schema, whose values are unknown', async () => {
        const { elements } = await loadSchema('<xs:element name="n" type="xs:int"/>');
        const [element] = elements;
        expectTypeOf(element!).toExtend<x.Element>();
        expectTypeOf(element!['~standard'].validate).parameter(0).toEqualTypeOf<unknown>();
        expectTypeOf(parse('<n>1</n>', element!)).toBeUnknown();
    });
});
