import { BindingBuilder } from '#binding';
import {
    type ClassToConstructable,
    type GenericHaywireId,
    type OutputHaywireId,
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
    <OutputId extends GenericHaywireId>(
        outputIdentifier: OutputId
    ): BindingBuilder<OutputHaywireId<OutputId>>;
    <Constructor extends IsClass>(
        clazz: Constructor
    ): BindingBuilder<ClassToConstructable<Constructor>>;
}
export const bind = ((outputIdentifier: GenericHaywireId) =>
    new BindingBuilder(
        unsafeIdentifier(outputIdentifier).supplier(false).lateBinding(false)
    )) as Bind;
