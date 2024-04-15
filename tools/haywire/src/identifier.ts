import {
    type ClassToConstructable,
    type ExtraAnnotations,
    type GenericHaystackId,
    type HaystackId,
    type StripAnnotations,
    unsafeIdentifier,
} from '#identifier';
import type { IsClass, UnknownType } from '#types';

export {
    type GenericHaystackId,
    HaystackId,
    type HaystackIdType,
} from '#identifier';

interface IdentifierGenerator {
    // Idempotent
    <T extends GenericHaystackId>(id: T): T;
    <T extends IsClass>(clazz: T, ...invalidInput: UnknownType<T>): ClassToConstructable<T>;
    <T>(
        name: string,
        ...invalidInput: [...ExtraAnnotations<T>, ...UnknownType<T>]
    ): HaystackId<StripAnnotations<T>, null, null, false, false, false, false>;
    <T>(
        ...invalidInput: [...ExtraAnnotations<T>, ...UnknownType<T>]
    ): HaystackId<StripAnnotations<T>, null, null, false, false, false, false>;
}

export const identifier = unsafeIdentifier as IdentifierGenerator;
