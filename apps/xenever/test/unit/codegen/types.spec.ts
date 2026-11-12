import type { x } from 'xenever';
import type * as content from '#test/generated/content.js';
import type * as names from '#test/generated/names.js';
import type * as order from '#test/generated/order.js';
import type * as pom from '#test/generated/pom.js';
import type * as tree from '#test/generated/tree.js';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';

// Each printed type must be the type the builders infer for its const. The type check of this file is the
// test; the runtime part only gives each a name in the report.
suite('Generated types', () => {
    test('Are what x.Infer gives for the order fixture', () => {
        expectTypeOf<x.Infer<typeof order.Status>>().toEqualTypeOf<order.Status>();
        expectTypeOf<x.Infer<typeof order.Tags>>().toEqualTypeOf<order.Tags>();
        expectTypeOf<x.Infer<typeof order.USState>>().toEqualTypeOf<order.USState>();
        expectTypeOf<x.Infer<typeof order.Zip>>().toEqualTypeOf<order.Zip>();
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

    test('Are what parse returns for an element', () => {
        expectTypeOf<x.Infer<typeof order.purchaseOrder>>().toEqualTypeOf<order.PurchaseOrder>();
        expectTypeOf<x.Infer<typeof order.comment>>().toEqualTypeOf<string | null>();
        expectTypeOf<x.Infer<typeof tree.outline>>().toEqualTypeOf<tree.Outline>();
        expectTypeOf<x.Infer<typeof names.x_2>>().toEqualTypeOf<-5n | 9_007_199_254_740_993n>();
    });
});
