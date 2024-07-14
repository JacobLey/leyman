import { BindingBuilder } from '#binding';
import {
    type ClassToConstructable,
    type GenericHaystackId,
    type HaystackId,
    unsafeIdentifier,
} from '#identifier';
import type { IsClass } from '#types';

export {
    type AsyncProviderBindingBuilder,
    Binding,
    type BindingBuilder,
    type DepsBindingBuilder,
    type GenericBinding,
    type ProviderBindingBuilder,
} from '#binding';

type BaseHaystackId<Id extends GenericHaystackId> = Id extends HaystackId<
    infer T,
    infer Constructor,
    infer Named,
    infer Nullable,
    infer Undefinable,
    'async' | boolean,
    boolean
>
    ? HaystackId<T, Constructor, Named, Nullable, Undefinable, false, false>
    : never;

interface Bind {
    <OutputId extends GenericHaystackId>(
        outputIdentifier: OutputId
    ): BindingBuilder<BaseHaystackId<OutputId>>;
    <Constructor extends IsClass>(
        clazz: Constructor
    ): BindingBuilder<ClassToConstructable<Constructor>>;
}
export const bind = ((outputIdentifier: GenericHaystackId) =>
    new BindingBuilder(
        unsafeIdentifier(outputIdentifier).supplier(false).lateBinding(false)
    )) as Bind;
