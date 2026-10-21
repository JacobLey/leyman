import type {
    ClassToConstructable,
    ExtraAnnotations,
    GenericHaywireId,
    HaywireId,
    StripAnnotations,
} from '#identifier';
import type { Invalid, IsClass, UnknownType } from '#types';
import { unsafeIdentifier } from '#identifier';

export {
    type ClassToConstructable,
    type GenericHaywireId,
    HaywireId,
    type HaywireIdProviderType,
    type HaywireIdType,
    type OutputHaywireId,
} from '#identifier';

interface IdentifierGenerator {
    // Idempotent
    <T extends GenericHaywireId>(id: T): T;
    <T extends IsClass>(clazz: Invalid<UnknownType<T>> & T): ClassToConstructable<T>;
    <T>(
        name: string & Invalid<[...ExtraAnnotations<T>, ...UnknownType<T>]>
    ): HaywireId<StripAnnotations<T>, null, null, false, false, false, false, false>;
    // No argument to carry a readable error, so an invalid `T` fails with "Expected 1 arguments"
    <T>(
        ...invalidInput: [...ExtraAnnotations<T>, ...UnknownType<T>]
    ): HaywireId<StripAnnotations<T>, null, null, false, false, false, false, false>;
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Not the same type: the `invalidInput` parameters reject invalid identifiers at compile time
export const identifier = unsafeIdentifier as IdentifierGenerator;
