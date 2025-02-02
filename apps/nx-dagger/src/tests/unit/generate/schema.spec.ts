import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';
import type { ParameterNames as ManualParameterNames } from '../../../generate/lib/types.js';
import type { ParameterNames as SchemaParameterNames } from '../../../generate/schema.js';

suite('Schema', () => {
    test('parameterNames', () => {
        expectTypeOf<SchemaParameterNames>().toEqualTypeOf<ManualParameterNames>();
    });
});
