import type { ClassToConstructable, GenericHaywireId } from '#identifier';
import type { IsClass } from '#types';
import { BindingBuilder } from '#binding';
import { unsafeIdentifier } from '#identifier';

export {
    type AsyncProviderBindingBuilder,
    Binding,
    type BindingBuilder,
    type DepsBindingBuilder,
    type Disposer,
    type GenericBinding,
    type ProviderBindingBuilder,
} from '#binding';

interface Bind {
    <OutputId extends GenericHaywireId>(outputIdentifier: OutputId): BindingBuilder<OutputId>;
    <Constructor extends IsClass>(
        clazz: Constructor
    ): BindingBuilder<ClassToConstructable<Constructor>>;
}
export const bind = ((outputIdentifier: GenericHaywireId) =>
    new BindingBuilder(unsafeIdentifier(outputIdentifier))) as Bind;
