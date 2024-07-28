import {
    type ClassToConstructable,
    type ExtraAnnotations,
    type GenericHaywireId,
    type HaywireId,
    type StripAnnotations,
    unsafeIdentifier,
} from '#identifier';
import type { IsClass, UnknownType } from '#types';

export {
    type ClassToConstructable,
    type GenericHaywireId,
    HaywireId,
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
    ): HaywireId<StripAnnotations<T>, null, null, false, false, false, false>;
    <T>(
        ...invalidInput: [...ExtraAnnotations<T>, ...UnknownType<T>]
    ): HaywireId<StripAnnotations<T>, null, null, false, false, false, false>;
}

export const identifier = unsafeIdentifier as IdentifierGenerator;
