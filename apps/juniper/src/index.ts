import { ArraySchema } from './schemas/array.js';
import { BooleanSchema } from './schemas/boolean.js';
import { CustomSchema } from './schemas/custom.js';
import { EnumSchema } from './schemas/enum.js';
import { MergeSchema } from './schemas/merge.js';
import { NeverSchema } from './schemas/never.js';
import { NullSchema } from './schemas/null.js';
import { NumberSchema } from './schemas/number.js';
import { ObjectSchema } from './schemas/object.js';
import { StringSchema } from './schemas/string.js';
import { TupleSchema } from './schemas/tuple.js';

export type { EmptyObject, PatternProperties } from './schemas/object.js';
export type {
    EmptyIndex,
    JsonSchema,
    Schema,
    SchemaType,
} from './lib/types.js';

export {
    ArraySchema,
    BooleanSchema,
    CustomSchema,
    EnumSchema,
    MergeSchema,
    NeverSchema,
    NullSchema,
    NumberSchema,
    ObjectSchema,
    StringSchema,
    TupleSchema,
};
export const arraySchema = ArraySchema.create;
export const booleanSchema = BooleanSchema.create;
export const customSchema = CustomSchema.create;
export const enumSchema = EnumSchema.create;
export const mergeSchema = MergeSchema.create;
export const neverSchema = NeverSchema.create;
export const nullSchema = NullSchema.create;
export const numberSchema = NumberSchema.create;
export const objectSchema = ObjectSchema.create;
export const stringSchema = StringSchema.create;
export const tupleSchema = TupleSchema.create;
