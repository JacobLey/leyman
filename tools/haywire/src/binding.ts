import { BindingBuilder } from '#binding';
import {
    type ClassToConstructable,
    type GenericHaystackId,
    type OutputHaystackId,
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

interface Bind {
    <OutputId extends GenericHaystackId>(
        outputIdentifier: OutputId
    ): BindingBuilder<OutputHaystackId<OutputId>>;
    <Constructor extends IsClass>(
        clazz: Constructor
    ): BindingBuilder<ClassToConstructable<Constructor>>;
}
export const bind = ((outputIdentifier: GenericHaystackId) =>
    new BindingBuilder(
        unsafeIdentifier(outputIdentifier).supplier(false).lateBinding(false)
    )) as Bind;
