/**
 * Most generic class possible.
 * Used by types to help determine if a method is a class constructor.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export declare abstract class Constructable {
    private constructor(...args: unknown[]);
}
/**
 * Almost the most generic class possible.
 *
 * @see {@link https://github.com/microsoft/TypeScript/issues/57412} why this is necessary
 *
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class, @typescript-eslint/no-unused-vars
declare abstract class ProtectedConstructable {
    protected constructor(...args: unknown[]);
}
export type IsClass = typeof Constructable | typeof ProtectedConstructable;
export type GenericClass<T = unknown> = new (...args: any) => T;
export type DepsClass<T, Deps extends readonly [...unknown[]]> = new (...args: Deps) => T;
export type InstanceOfClass<T extends IsClass> = InstanceType<
    // Order Matters!
    // eslint-disable-next-line @typescript-eslint/sort-type-constituents
    (new () => never) & T
>;

declare const invalidInput: unique symbol;
export interface InvalidInput<Title extends string = 'InvalidInput'> {
    name: string;
    [invalidInput]: Title;
}

type UnknownInput = [InvalidInput<'UnknownInput'>];
export type UnknownType<T> = [unknown] extends [T]
    ? UnknownInput
    : [T] extends [never]
      ? UnknownInput
      : [];

type ExtendsInput = [InvalidInput<'InvalidExtendsInput'>];
export type ExtendsType<T, E> = T extends E ? [] : ExtendsInput;

// https://stackoverflow.com/questions/52931116/decompose-a-typescript-union-type-into-specific-types
type UnionToParm<U> = U extends any ? (k: U) => void : never;
type UnionToSect<U> = UnionToParm<U> extends (k: infer I) => void ? I : never;
type ExtractParm<F> = F extends (a: infer A) => void ? A : never;

type SpliceOne<Union> = Exclude<Union, ExtractOne<Union>>;
type ExtractOne<Union> = ExtractParm<UnionToSect<UnionToParm<Union>>>;

type ToTuple<Union> = ToTupleRec<Union, []>;
type ToTupleRec<Union, Rslt extends any[]> = SpliceOne<Union> extends never
    ? [ExtractOne<Union>, ...Rslt]
    : ToTupleRec<SpliceOne<Union>, [ExtractOne<Union>, ...Rslt]>;

type LiteralStringInput = [InvalidInput<'LiteralStringInput'>];
// Enforce that the provided type is a unique symbol, or a literal string
export type LiteralStringType<T extends string | symbol> = ToTuple<T> extends {
    length: 1;
}
    ? string extends T
        ? LiteralStringInput
        : [T] extends [symbol]
          ? symbol extends T
              ? LiteralStringInput
              : []
          : []
    : LiteralStringInput;

declare const supplier: unique symbol;
export interface Supplier<T> {
    [supplier]: typeof supplier;
    (): T;
}
declare const asyncSupplier: unique symbol;
export interface AsyncSupplier<T> {
    [asyncSupplier]: typeof asyncSupplier;
    (): Promise<T>;
}

declare const lateBinding: unique symbol;
export interface LateBinding<T> extends Promise<T> {
    [lateBinding]: true;
}

export type Names = string | symbol | null;

declare const nonExtendable: unique symbol;
export interface Extendable {
    [nonExtendable]: true;
    (val: never): unknown;
    c: (val: never) => unknown;
}
export interface NonExtendable<
    T,
    Construct extends GenericClass<any> | IsClass | null,
    Named extends Names,
> extends Extendable {
    (val: T): T;
    construct: (val: Construct) => Construct;
    mame: (val: Named) => Named;
}

type ExpandOutputUndefinable<
    T,
    Construct extends GenericClass<any> | IsClass | null,
    Named extends Names,
    Undefinable extends boolean,
> = true extends Undefinable
    ? [NonExtendable<T | undefined, Construct, Named>]
    : [NonExtendable<T | undefined, Construct, Named>] | [NonExtendable<T, Construct, Named>];
type ExpandOutputNullable<
    T,
    Construct extends GenericClass<any> | IsClass | null,
    Named extends Names,
    Nullable extends boolean,
    Undefinable extends boolean,
> = true extends Nullable
    ? ExpandOutputUndefinable<T | null, Construct, Named, Undefinable>
    :
          | ExpandOutputUndefinable<T | null, Construct, Named, Undefinable>
          | ExpandOutputUndefinable<T, Construct, Named, Undefinable>;

export type { ExpandOutputNullable as ExpandOutput };
