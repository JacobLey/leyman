import type { StandardSchemaV1 } from '@standard-schema/spec';
import type * as names from '#test/generated/names.js';
import type * as order from '#test/generated/order.js';
import type * as pom from '#test/generated/pom.js';
import type * as shapes from '#test/generated/shapes.js';
import type * as tree from '#test/generated/tree.js';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';
import { x } from 'xenever';
import * as content from '#test/generated/content.js';

/**
 * Types a declaration's value, to assert on it.
 *
 * @param declaration - an element declaration or a type
 * @returns the declaration itself at runtime, typed as the value `parse` would return
 */
const inferred = <T>(declaration: T): x.Infer<T> => declaration as never;

// Each printed type must be the type the builders infer for its const. The type check of this file is the
// test; the runtime part only builds the declarations compared and gives each check a name in the report.
suite('Generated types', () => {
    test('Are what x.Infer gives for the order fixture', () => {
        expectTypeOf<x.Infer<typeof order.Status>>().toEqualTypeOf<order.Status>();
        expectTypeOf<x.Infer<typeof order.Tags>>().toEqualTypeOf<order.Tags>();
        expectTypeOf<x.Infer<typeof order.USState>>().toEqualTypeOf<order.USState>();
        expectTypeOf<x.Infer<typeof order.Zip>>().toEqualTypeOf<order.Zip>();
        expectTypeOf<x.Infer<typeof order.FewTags>>().toEqualTypeOf<order.FewTags>();
        expectTypeOf<x.Infer<typeof order.ShortZip>>().toEqualTypeOf<order.ShortZip>();
        expectTypeOf<x.Infer<typeof order.Holiday>>().toEqualTypeOf<order.Holiday>();
        expectTypeOf<order.Holiday>().toEqualTypeOf<string>();
        expectTypeOf<x.Infer<typeof order.TagPair>>().toEqualTypeOf<order.TagPair>();
        expectTypeOf<x.Infer<typeof order.Address>>().toEqualTypeOf<order.Address>();
        expectTypeOf<x.Infer<typeof order.SKU>>().toEqualTypeOf<order.SKU>();
        expectTypeOf<x.Infer<typeof order.Currency>>().toEqualTypeOf<order.Currency>();
        expectTypeOf<x.Infer<typeof order.Amount>>().toEqualTypeOf<order.Amount>();
        expectTypeOf<x.Infer<typeof order.Price>>().toEqualTypeOf<order.Price>();
        expectTypeOf<x.Infer<typeof order.Items>>().toEqualTypeOf<order.Items>();
        expectTypeOf<x.Infer<typeof order.Note>>().toEqualTypeOf<order.Note>();
        expectTypeOf<
            x.Infer<typeof order.PurchaseOrderType>
        >().toEqualTypeOf<order.PurchaseOrderType>();
    });

    test('Are what x.Infer gives for the content fixture', () => {
        expectTypeOf<x.Infer<typeof content.Repeated>>().toEqualTypeOf<content.Repeated>();
        expectTypeOf<x.Infer<typeof content.Branches>>().toEqualTypeOf<content.Branches>();
        expectTypeOf<x.Infer<typeof content.Small>>().toEqualTypeOf<content.Small>();
        expectTypeOf<x.Infer<typeof content.Shapes>>().toEqualTypeOf<content.Shapes>();
        expectTypeOf<x.Infer<typeof content.Mixed>>().toEqualTypeOf<content.Mixed>();
        expectTypeOf<x.Infer<typeof content.Odd>>().toEqualTypeOf<content.Odd>();
        expectTypeOf<x.Infer<typeof content.Positive>>().toEqualTypeOf<content.Positive>();
        expectTypeOf<x.Infer<typeof content.Measure>>().toEqualTypeOf<content.Measure>();
        expectTypeOf<x.Infer<typeof content.Length>>().toEqualTypeOf<content.Length>();
        expectTypeOf<x.Infer<typeof content.Values>>().toEqualTypeOf<content.Values>();
    });

    test('Are what x.Infer gives for the names fixture', () => {
        expectTypeOf<x.Infer<typeof names.LineItem>>().toEqualTypeOf<names.LineItem>();
        expectTypeOf<x.Infer<typeof names.LineItem_2>>().toEqualTypeOf<names.LineItem_2>();
        expectTypeOf<x.Infer<typeof names.LineItem_3>>().toEqualTypeOf<names.LineItem_3>();
        expectTypeOf<x.Infer<typeof names.Default>>().toEqualTypeOf<names.Default>();
        expectTypeOf<x.Infer<typeof names.Catalog>>().toEqualTypeOf<names.Catalog>();
    });

    test('Are what x.Infer gives for the POM fixture', () => {
        expectTypeOf<x.Infer<typeof pom.Parent>>().toEqualTypeOf<pom.Parent>();
        expectTypeOf<x.Infer<typeof pom.Dependency>>().toEqualTypeOf<pom.Dependency>();
        expectTypeOf<x.Infer<typeof pom.Model>>().toEqualTypeOf<pom.Model>();
    });

    test('Are what x.Infer gives for a recursive type, through the lazy reference', () => {
        expectTypeOf<x.Infer<typeof tree.Node>>().toEqualTypeOf<tree.Node>();
    });

    // A generated element const is annotated with its printed type, so `x.Infer` of the const only reads that
    // annotation back. Each printed element type is instead compared with `x.Infer` of the element declared
    // again here from the XSD: through its named type's const, or built anew when its type is anonymous.
    test('Are what parse returns for an element with a named type', () => {
        expectTypeOf<
            x.Infer<typeof order.PurchaseOrderType>
        >().toEqualTypeOf<order.PurchaseOrder>();
        expectTypeOf<x.Infer<typeof tree.Node>>().toEqualTypeOf<tree.Tree>();
        expectTypeOf<x.Infer<typeof names.Catalog>>().toEqualTypeOf<names.Catalog_2>();
        expectTypeOf<x.Infer<typeof names.LineItem_2>>().toEqualTypeOf<names.X>();
        expectTypeOf<names.X>().toEqualTypeOf<-5n | 9_007_199_254_740_993n>();
        expectTypeOf<x.Infer<typeof pom.Model>>().toEqualTypeOf<pom.Project>();
    });

    test('Are what parse returns for an element with an anonymous type', () => {
        const comment = x.element('comment', x.string(), {
            namespace: 'urn:example:order',
            nillable: true,
        });
        expectTypeOf(inferred(comment)).toEqualTypeOf<order.Comment>();

        const className = x.element('class', x.string(), { namespace: 'urn:example:names' });
        expectTypeOf(inferred(className)).toEqualTypeOf<names.Class>();

        const anything = x.element(
            'anything',
            x.complex({
                mixed: true,
                attributes: [x.anyAttribute()],
                content: x.sequence([x.any({ minOccurs: 0, maxOccurs: 'unbounded' })]),
            }),
            { namespace: 'urn:example:content' }
        );
        expectTypeOf(inferred(anything)).toEqualTypeOf<content.Anything>();

        const contentElement = x.element(
            'content',
            x.complex({
                content: x.sequence([
                    x.element('repeated', content.Repeated),
                    x.element('branches', content.Branches),
                    x.element('shapes', content.Shapes, { maxOccurs: 2 }),
                    x.element('mixed', content.Mixed),
                    x.element('odd', content.Odd, { maxOccurs: 'unbounded' }),
                    x.element('positive', content.Positive, { default: '1.5' }),
                    x.element('length', content.Length),
                    x.element('values', content.Values),
                    x.element('empty', x.complex(), { nillable: true }),
                ]),
            }),
            { namespace: 'urn:example:content' }
        );
        expectTypeOf(inferred(contentElement)).toEqualTypeOf<content.Content>();

        // The recursive reference needs an annotation, so only the outer level is inferred.
        const outline = x.element(
            'outline',
            x.complex({
                content: x.sequence([
                    x.element('title', x.string()),
                    x.lazy((): x.ElementOf<'outline', tree.Outline> => outline, {
                        minOccurs: 0,
                        maxOccurs: 'unbounded',
                    }),
                ]),
            })
        );
        expectTypeOf(inferred(outline)).toEqualTypeOf<tree.Outline>();
    });

    test('Are what parse returns for references to the heads of substitution groups', () => {
        const namespace = 'urn:example:shapes';
        const shape = x.complex({ attributes: [x.attribute('id', x.id(), { use: 'required' })] });
        const circle = x.complex({
            attributes: [
                x.attribute('id', x.id(), { use: 'required' }),
                x.attribute('radius', x.decimal(), { use: 'required' }),
            ],
        });
        const drawing = x.element(
            'drawing',
            x.complex({
                content: x.sequence([
                    x.choice([
                        x.element('label', x.string(), { namespace }),
                        x.element('title', x.token(), { namespace }),
                    ]),
                    x.choice(
                        [
                            x.element('circle', circle, { namespace }),
                            x.element('square', shape, { namespace }),
                        ],
                        { minOccurs: 0, maxOccurs: 'unbounded' }
                    ),
                ]),
            }),
            { namespace }
        );
        expectTypeOf(inferred(drawing)).toEqualTypeOf<shapes.Drawing>();
        expectTypeOf(
            inferred(x.element('shape', shape, { namespace, abstract: true }))
        ).toEqualTypeOf<shapes.Shape_2>();
        expectTypeOf<shapes.Shape_2>().toBeNever();
    });

    test('Read their printed type back from the annotation', () => {
        expectTypeOf<x.Infer<typeof order.purchaseOrder>>().toEqualTypeOf<order.PurchaseOrder>();
        expectTypeOf<x.Infer<typeof tree.outline>>().toEqualTypeOf<tree.Outline>();
    });

    test('Are Standard Schemas parsing a string into the element type', () => {
        expectTypeOf<typeof order.purchaseOrder>().toExtend<
            StandardSchemaV1<string, order.PurchaseOrder>
        >();
        expectTypeOf<
            StandardSchemaV1.InferOutput<typeof order.purchaseOrder>
        >().toEqualTypeOf<order.PurchaseOrder>();
        expectTypeOf<
            StandardSchemaV1.InferInput<typeof order.purchaseOrder>
        >().toEqualTypeOf<string>();
        expectTypeOf<
            StandardSchemaV1.InferOutput<typeof tree.outline>
        >().toEqualTypeOf<tree.Outline>();
    });
});
