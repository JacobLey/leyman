import type {
    ClassToConstructable,
    ExtraAnnotations,
    GenericHaywireId,
    HaywireId,
    StripAnnotations,
} from '#identifier';
import type { IsClass, UnknownType } from '#types';
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
    <T extends IsClass>(clazz: T, ...invalidInput: UnknownType<T>): ClassToConstructable<T>;
    <T>(
        name: string,
        ...invalidInput: [...ExtraAnnotations<T>, ...UnknownType<T>]
    ): HaywireId<StripAnnotations<T>, null, null, false, false, false, false, false>;
    <T>(
        ...invalidInput: [...ExtraAnnotations<T>, ...UnknownType<T>]
    ): HaywireId<StripAnnotations<T>, null, null, false, false, false, false, false>;
}

// Not the same type: the `invalidInput` parameters reject invalid identifiers at compile time
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
export const identifier = unsafeIdentifier as IdentifierGenerator;
