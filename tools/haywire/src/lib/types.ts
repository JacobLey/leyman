import type { Constructable } from '../../constructable.js';

export type { Constructable };

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
type ToTupleRec<Union, Rslt extends any[]> =
    SpliceOne<Union> extends never
        ? [ExtractOne<Union>, ...Rslt]
        : ToTupleRec<SpliceOne<Union>, [ExtractOne<Union>, ...Rslt]>;

type LiteralStringInput = [InvalidInput<'LiteralStringInput'>];
// Enforce that the provided type is a unique symbol, or a literal string
export type LiteralStringType<T extends string | symbol> =
    ToTuple<T> extends {
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

declare const multiList: unique symbol;
export interface MultiList<T> extends Array<T> {
    [multiList]: typeof multiList;
}

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

declare const deferred: unique symbol;
export interface Deferred<T> extends Promise<T> {
    [deferred]: typeof deferred;
}

export type Names = string | symbol | null;

declare const nonExtendable: unique symbol;
export interface Extendable {
    [nonExtendable]: true;
}
export interface NonExtendable<
    T,
    Construct extends GenericClass<any> | IsClass | null,
    Named extends Names,
    List extends boolean,
    Nullable extends boolean,
    Undefinable extends boolean,
> extends Extendable {
    (val: T): T;
    construct: (val: Construct) => Construct;
    name: (val: Named) => Named;
    list: (list: List) => List;
    nullable: (nullable: Nullable) => Nullable;
    undefinable: (undefinable: Undefinable) => Undefinable;
}

type ExpandOutputUndefinable<
    T,
    Construct extends GenericClass<any> | IsClass | null,
    Named extends Names,
    List extends boolean,
    Nullable extends boolean,
    Undefinable extends boolean,
> = true extends Undefinable
    ? [NonExtendable<T, Construct, Named, List, Nullable, true>]
    :
          | [NonExtendable<T, Construct, Named, List, Nullable, false>]
          | [NonExtendable<T, Construct, Named, List, Nullable, true>];
type ExpandOutputNullable<
    T,
    Construct extends GenericClass<any> | IsClass | null,
    Named extends Names,
    List extends boolean,
    Nullable extends boolean,
    Undefinable extends boolean,
> = true extends Nullable
    ? ExpandOutputUndefinable<T, Construct, Named, List, true, Undefinable>
    :
          | ExpandOutputUndefinable<T, Construct, Named, List, false, Undefinable>
          | ExpandOutputUndefinable<T, Construct, Named, List, true, Undefinable>;

export type { ExpandOutputNullable as ExpandOutput };

/**
 * Error messages for each failed validation (keyed by `InvalidInput` reason), shown by TypeScript when a call is invalid.
 */
interface ValidationMessages {
    bindingExists: 'Error: an output is already bound. Use replaceBinding() on a module to swap it.';
    dependenciesNotSatisfiedByOutput: 'Error: a dependency is stricter than the output provided for it, e.g. it needs a non-null value but the output is nullable.';
    missingOutput: 'Error: some dependencies have no binding. Add bindings for them before creating a container.';
    noBindingDeclared: 'Error: the container has no binding for this id.';
    noBindingToReplace: 'Error: the module has no binding for this output to replace. Use addBinding() instead.';
    outputDoesNotSatisfyDependency: 'Error: the output is laxer than what depends on it, e.g. it is nullable but a non-null value is needed.';
}

/**
 * Messages for every failed validation in `Validation`, or `never` if it passed.
 *
 * @template Validation - tuple of `InvalidInput`s, empty when valid
 */
type ValidationMessage<Validation extends readonly unknown[]> =
    Validation[number] extends infer Failure
        ? Failure extends InvalidInput<infer Reason>
            ? ValidationMessages[Uncapitalize<Reason> & keyof ValidationMessages]
            : never
        : never;

/**
 * `unknown` when `Validation` passes, otherwise an object requiring its error messages.
 *
 * Intersected with a parameter type, so an invalid argument fails with a readable message:
 * `Property 'error' is missing in type ... but required in type '{ error: "Error: ..." }'`.
 * An intersection (rather than replacing the parameter type) keeps the parameter's generic inferable.
 *
 * @template Validation - tuple of `InvalidInput`s, empty when valid
 */
export type Invalid<Validation extends readonly unknown[]> = [
    ValidationMessage<Validation>,
] extends [never]
    ? unknown
    : { error: ValidationMessage<Validation> };

/**
 * Skips `Validation` when `Outputs` is `any`, as in `GenericModule` and `GenericContainerFactory`.
 * Otherwise the error each method requires would differ, and no concrete instance would be assignable to them.
 *
 * @template Outputs - outputs of the module or factory
 * @template Validation - validation to apply to a concrete module
 */
export type ValidateConcrete<Outputs, Validation extends readonly unknown[]> = 0 extends 1 & Outputs
    ? []
    : Validation;
