import type {
    AsyncSupplier,
    GenericClass,
    InstanceOfClass,
    InvalidInput,
    IsClass,
    LateBinding,
    LiteralStringType,
    Names,
    Supplier,
} from '#types';

declare const abstractPrivateId: unique symbol;
export interface AbstractPrivateClass {
    [abstractPrivateId]: true;
    new (...args: any): any;
}
export type ClassToConstructable<T extends IsClass> = T extends GenericClass<infer U>
    ? HaywireId<U, T, null, false, false, false, false>
    : HaywireId<InstanceOfClass<T>, AbstractPrivateClass, null, false, false, false, false>;

const classToIdCache = new WeakMap<GenericClass, HaywireId<any, any, any, any, any, any, any>>();

type AllAnnotations = 'latebinding' | 'nullable' | 'supplier' | 'undefinable';
type StripNullable<T, A extends AllAnnotations = 'nullable'> = 'nullable' extends A
    ? [T] extends [infer U | null]
        ? U
        : T
    : T;
type StripUndefinable<T, A extends AllAnnotations = 'undefinable'> = 'undefinable' extends A
    ? [T] extends [infer U | undefined]
        ? U
        : T
    : T;
type StripSupplier<T, A extends AllAnnotations = 'supplier'> = 'supplier' extends A
    ? [T] extends [Supplier<infer U>]
        ? U
        : [T] extends [AsyncSupplier<infer U>]
          ? U
          : T
    : T;
type StripLateBinding<T, A extends AllAnnotations = 'latebinding'> = 'latebinding' extends A
    ? [T] extends [LateBinding<infer U>]
        ? U
        : T
    : T;
export type StripAnnotations<T, A extends AllAnnotations = AllAnnotations> = StripNullable<
    StripUndefinable<StripSupplier<StripLateBinding<T, A>, A>, A>,
    A
>;

export type ExtraAnnotations<T> = [T] extends [StripAnnotations<T>]
    ? []
    : [InvalidInput<'ExtraAnnotations'>];

interface UnsafeIdentifierGenerator {
    // Idempotent
    <T extends GenericHaywireId>(id: T): T;
    <T extends IsClass>(clazz: T): ClassToConstructable<T>;
    <T>(name?: string): HaywireId<StripAnnotations<T>, null, null, false, false, false, false>;
}

type SupplierProp<T extends 'async' | boolean> = T extends false
    ? T
    : {
          sync: T extends 'async' ? false : true;
          propagateScope: boolean;
      };

interface Annotations<
    Named extends Names,
    Nullable extends boolean,
    Undefinable extends boolean,
    Supply extends 'async' | boolean,
    LateBind extends boolean,
> {
    /**
     * Discriminator for different types that look the same (e.g. two different config strings need different names)
     */
    readonly named: Named;
    /**
     * If true, generated type can be null
     */
    readonly nullable: Nullable;
    /**
     * If true, generated type can be undefined
     */
    readonly undefinable: Undefinable;
    /**
     * If true, generated type will be returned by a parameter-less function
     */
    readonly supplier: SupplierProp<Supply>;
    /**
     * If true, generated type will be wrapped in a promise
     */
    readonly lateBinding: LateBind;
}

declare const idType: unique symbol;
const unsafeIdSym = Symbol('unsafeIdentifier');

const defaultAnnotations: Annotations<null, false, false, false, false> = {
    named: null,
    nullable: false,
    undefinable: false,
    supplier: false,
    lateBinding: false,
};
const MAX_NUMBER_RADIX = 36;

/**
 * Class to contain a reference to a "type".
 * This may be as straightforward as another class (indicated by the constructor), or may use unique indicators like a symbol
 * to help point to a type-only construct (which does not exist at runtime).
 *
 * The type itself cannot be `null` or `undefined`, but may be indicated that these are acceptable values
 * (generally when a real instance cannot be created).
 *
 * Additionally can indicate the type should be a `supplier` (a function that accepts no parameters and returns the instance)
 * or `latebinding` (a promise that will _eventually_ resolve into the requested value, or reject if issues arise).
 * Note that the implemention of both these annotations is internal to Haywire. If the requested value is in fact a function or a promise,
 * declare that on the type itself.
 *
 * @template T
 * @template Constructor
 * @template Named
 * @template Nullable
 * @template Undefinable
 * @template Supply
 * @template LateBind
 */
export class HaywireId<
    T,
    Constructor extends GenericClass<T> | null,
    Named extends Names,
    Nullable extends boolean,
    Undefinable extends boolean,
    Supply extends 'async' | boolean,
    LateBind extends boolean,
> {
    static readonly #symToRand = new WeakMap<symbol, string>();
    static #pseudoRandTracker = 0;

    public declare readonly [idType]: T;
    #baseId: HaywireId<T, Constructor, Named, false, false, false, false> | null = null;
    readonly #childIds: Map<string, HaywireId<any, any, any, any, any, any, any>>;

    public readonly id: string;
    public readonly construct: Constructor;
    public readonly annotations: Annotations<Named, Nullable, Undefinable, Supply, LateBind>;

    private constructor(
        id: string,
        construct: Constructor,
        annotations: Annotations<
            Named,
            Nullable,
            Undefinable,
            Supply,
            LateBind
        > = defaultAnnotations as typeof annotations,
        childIds = new Map<string, HaywireId<any, any, any, any, any, any, any>>()
    ) {
        this.id = id;
        this.construct = construct;
        this.annotations = annotations;
        this.#childIds = childIds;
        this.#childIds.set(HaywireId.#annotationKey(annotations), this);
    }

    public toString(): string {
        let text = this.id;
        const { annotations } = this;
        const annotationsText = [
            annotations.named === null ? null : (`named: ${String(annotations.named)}` as const),
            annotations.nullable && ('nullable' as const),
            annotations.undefinable && ('undefinable' as const),
            typeof annotations.supplier === 'object' &&
                (`supplier(${[
                    annotations.supplier.sync ? 'sync' : 'async',
                    annotations.supplier.propagateScope && 'propagating',
                ]
                    .filter(Boolean)
                    .join(', ')})` as const),
            annotations.lateBinding && ('late-binding' as const),
        ].filter(Boolean);
        if (annotationsText.length > 0) {
            text += `(${annotationsText.join(', ')})`;
        }
        return text;
    }

    /**
     * Get the most generic form of the identifier, which is just the unique identifier instance,
     * possibly with the class constructor attached.
     *
     * Any annotations like `nullable` or `supplier` are removed.
     *
     * @example
     * const id = identifier();
     * id.nullable().lateBinding().baseId() === id; // true
     *
     * @returns generic form of identifier
     */
    public baseId(): HaywireId<T, Constructor, Named, false, false, false, false> {
        if (!this.#baseId) {
            this.#baseId = this.#extend({
                ...this.annotations,
                nullable: false,
                undefinable: false,
                supplier: false,
                lateBinding: false,
            });
        }
        return this.#baseId;
    }

    /**
     * Create a new identifier with the set name. Useful to discriminate between different
     * values that have the same underlying type.
     *
     * Does not mutate existing immutable id, but creates a new id that internally references the same base id.
     *
     * @example
     * const databaseUsernameId = identifier<string>().named('database-username');
     * const adminEmail = identifier<string>().named('admin-email');
     *
     * @param [name=null] - discrimintor to identify id. Can be a string or a _unique_ symbol. Defaults to null (unsets value).
     * @returns new identifier with discriminitor set
     */
    public named(
        name?: null
    ): HaywireId<T, Constructor, null, Nullable, Undefinable, Supply, LateBind>;
    public named<NewName extends string | symbol>(
        named: NewName,
        ...invalidInput: LiteralStringType<NewName>
    ): HaywireId<T, Constructor, NewName, Nullable, Undefinable, Supply, LateBind>;
    public named(named: string | symbol | null = null): GenericHaywireId {
        if (this.annotations.named === named) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            named,
        });
    }

    /**
     * Create a new identifier with typed unioned with `null`.
     *
     * Does not mutate existing immutable id, but creates a new id that internally references the same base id.
     *
     * @param [nullable=true] - whethe to (un)set the nullable value. Defaults to true (sets value).
     * @returns new identifier with nullable set
     */
    public nullable(
        nullable: false
    ): HaywireId<T, Constructor, Named, false, Undefinable, Supply, LateBind>;
    public nullable(
        nullable?: true
    ): HaywireId<T, Constructor, Named, true, Undefinable, Supply, LateBind>;
    public nullable(nullable = true): GenericHaywireId {
        if (this.annotations.nullable === nullable) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            nullable,
        });
    }

    /**
     * Create a new identifier with typed unioned with `undefined`.
     *
     * Does not mutate existing immutable id, but creates a new id that internally references the same base id.
     *
     * @param [undefinable=true] - whethe to (un)set the undefinable value. Defaults to true (sets value).
     * @returns new identifier with undefinable set
     */
    public undefinable(
        undefinable: false
    ): HaywireId<T, Constructor, Named, Nullable, false, Supply, LateBind>;
    public undefinable(
        undefinable?: true
    ): HaywireId<T, Constructor, Named, Nullable, true, Supply, LateBind>;
    public undefinable(undefinable = true): GenericHaywireId {
        if (this.annotations.undefinable === undefinable) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            undefinable,
        });
    }

    /**
     * Mark identifier as a supplier.
     * Should only be used when declaring a dependency for a provider (instead of an output or requested value from container).
     *
     * It will create a new identifier with the annotation set, rather than mutate the existing.
     *
     * @param [supplier=true] - if boolean, (un)sets the supplier.
     * As an object, also can indicate whether supplier should propagate ("continue")
     * the scope of the request that generated the supplier, rather than initializing a brand new request.
     * @returns a new identifier with annotation
     */
    public supplier(
        supplier: false
    ): HaywireId<T, Constructor, Named, Nullable, Undefinable, false, LateBind>;
    public supplier(
        supplier?:
            | true
            | {
                  sync: true;
                  propagateScope: boolean;
              }
    ): HaywireId<T, Constructor, Named, Nullable, Undefinable, true, LateBind>;
    public supplier(
        supplier:
            | 'async'
            | {
                  sync: false;
                  propagateScope: boolean;
              }
    ): HaywireId<T, Constructor, Named, Nullable, Undefinable, 'async', LateBind>;
    public supplier(
        supplier:
            | 'async'
            | boolean
            | {
                  sync: boolean;
                  propagateScope: boolean;
              } = true
    ): GenericHaywireId {
        let supplierContext: SupplierProp<'async' | boolean>;
        if (supplier === false) {
            supplierContext = false;
        } else if (typeof supplier === 'object') {
            supplierContext = supplier;
        } else {
            supplierContext = {
                sync: supplier === true,
                propagateScope: false,
            };
        }

        if (this.annotations.supplier === supplier) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            supplier:
                typeof supplierContext === 'object'
                    ? {
                          sync: supplierContext.sync,
                          propagateScope: supplierContext.propagateScope,
                      }
                    : supplierContext,
        });
    }

    /**
     * Mark identifier as late-binding.
     * Should only be used when declaring a dependency for a provider (instead of an output or requested value from container).
     *
     * It will create a new identifier with the annotation set, rather than mutate the existing.
     *
     * @param [supplier=true] - (un)sets the late-binding
     * @returns new identifier with annotation
     */
    public lateBinding(
        lateBinding: false
    ): HaywireId<T, Constructor, Named, Nullable, Undefinable, Supply, false>;
    public lateBinding(
        lateBinding?: true
    ): HaywireId<T, Constructor, Named, Nullable, Undefinable, Supply, true>;
    public lateBinding(lateBinding = true): GenericHaywireId {
        if (this.annotations.lateBinding === lateBinding) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            lateBinding,
        });
    }

    public static readonly [unsafeIdSym]?: UnsafeIdentifierGenerator = <
        T2,
        Constructor2 extends GenericClass<T2> | null = null,
        Named2 extends Names = null,
    >(
        idOrNameOrClass?:
            | string
            | GenericClass<T2>
            | HaywireId<T2, Constructor2, Named2, false, false, false, false>
    ): HaywireId<T2, Constructor2, Named2, false, false, false, false> => {
        // Idempotency
        if (idOrNameOrClass instanceof HaywireId) {
            return idOrNameOrClass;
        }

        if (typeof idOrNameOrClass === 'string') {
            if (idOrNameOrClass) {
                return new HaywireId<T2, Constructor2, Named2, false, false, false, false>(
                    idOrNameOrClass,
                    null as Constructor2
                );
            }
        } else if (idOrNameOrClass) {
            const cachedId = classToIdCache.get(idOrNameOrClass);
            if (cachedId) {
                return cachedId;
            }
            const id = new HaywireId<T2, Constructor2, Named2, false, false, false, false>(
                idOrNameOrClass.name,
                idOrNameOrClass as Constructor2
            );
            classToIdCache.set(idOrNameOrClass, id);
            return id;
        }

        return new HaywireId<T2, Constructor2, Named2, false, false, false, false>(
            'haywire-id',
            null as Constructor2
        );
    };

    /**
     * Return a unique + "random" string assigned to the name attribute of the id.
     * Necessary to consistently calculate a value for symbols that cannot be trivially stringified.
     *
     * @example
     * Symbol('abc') !== Symbol('abc') // different symbols
     * Symbol('abc').toString() === Symbol('abc').toString() // same stringified values, so need unique values for each
     *
     * @param named - name attribute of id
     * @returns randomly assigned string to symbol. Will be cached, and consistently returned on future calls.
     */
    static #getSymRand(named: symbol): string {
        const symFor = Symbol.keyFor(named);
        if (typeof symFor === 'string') {
            // If value is not "unique" (e.g. Symbol.for('abc'), not allowed in WeakMap) then
            // use its value with characters that are not part of normal number encoding
            return `sym:${symFor}`;
        }
        const existing = this.#symToRand.get(named);
        if (existing) {
            return existing;
        }
        // Increment a global val and transform to a string, and save for future uses
        ++this.#pseudoRandTracker;
        const val = this.#pseudoRandTracker.toString(MAX_NUMBER_RADIX);
        this.#symToRand.set(named, val);
        return val;
    }

    /**
     * Generate a key that uniquely representing the unique combination of annotation settings.
     * Can be used to look up previously generated instances of ids to ensure proper re-use and references.
     *
     * Since all methods on the identifier return a new instance (identifiers themselves are immutable) we need to rely on a
     * cache to make sure that for any unique combintation of base id + annotations, at most a single instance exists.
     *
     * @example
     * const id = identifier();
     * id.nullable().nullable(false) === id; // This is _necessary_ behavior
     *
     * @param annotations - annotations from the identifier
     * @returns string representing annotation settings
     */
    static #annotationKey({
        named,
        nullable,
        undefinable,
        supplier,
        lateBinding,
    }: Annotations<string | symbol | null, boolean, boolean, 'async' | boolean, boolean>): string {
        const key = JSON.stringify([named, nullable, undefinable, supplier, lateBinding]);
        if (typeof named === 'symbol') {
            // Stringified symbols becomes null, so need to attach extra metadata to account for symbol value
            return this.#getSymRand(named) + key;
        }
        return key;
    }

    /**
     * Create a new identifier based on annotations, or use an existing if it was created before.
     * All ids forked from a base id are stored in a map, with a unique key per combination.
     *
     * @param annotations - annotations from the identifier
     * @returns new id with supplied annotation properties
     */
    #extend<
        Named2 extends Names,
        Nullable2 extends boolean,
        Undefinable2 extends boolean,
        Supply2 extends 'async' | boolean,
        LateBind2 extends boolean,
    >(
        annotations: Annotations<Named2, Nullable2, Undefinable2, Supply2, LateBind2>
    ): HaywireId<T, Constructor, Named2, Nullable2, Undefinable2, Supply2, LateBind2> {
        const existing = this.#childIds.get(HaywireId.#annotationKey(annotations));
        if (existing) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return existing;
        }

        return new HaywireId(this.id, this.construct, annotations, this.#childIds);
    }
}

export const unsafeIdentifier = HaywireId[unsafeIdSym]!;
delete (HaywireId as Record<typeof unsafeIdSym, unknown>)[unsafeIdSym];

export type GenericHaywireId = HaywireId<
    unknown,
    GenericClass | null,
    string | symbol | null,
    boolean,
    boolean,
    'async' | boolean,
    boolean
>;
export type GenericOutputHaywireId = HaywireId<
    unknown,
    GenericClass | null,
    string | symbol | null,
    boolean,
    boolean,
    false,
    false
>;

type HaywireIdTypeNullable<Id extends GenericHaywireId> = Id['annotations']['nullable'] extends true
    ? Id[typeof idType] | null
    : Id[typeof idType];
type HaywireIdTypeUndefinable<Id extends GenericHaywireId> =
    Id['annotations']['undefinable'] extends true
        ? HaywireIdTypeNullable<Id> | undefined
        : HaywireIdTypeNullable<Id>;
type HaywireIdTypeSupplier<Id extends GenericHaywireId> = Id['annotations']['supplier'] extends {
    sync: infer U;
}
    ? U extends true
        ? Supplier<HaywireIdTypeUndefinable<Id>>
        : AsyncSupplier<HaywireIdTypeUndefinable<Id>>
    : HaywireIdTypeUndefinable<Id>;
export type HaywireIdType<Id extends GenericHaywireId> =
    Id['annotations']['lateBinding'] extends true
        ? LateBinding<HaywireIdTypeSupplier<Id>>
        : HaywireIdTypeSupplier<Id>;

export type OutputHaywireId<Id extends GenericHaywireId> = HaywireId<
    Id[typeof idType],
    Id['construct'],
    Id['annotations']['named'],
    Id['annotations']['nullable'],
    Id['annotations']['undefinable'],
    false,
    false
>;

export type HaywireIdConstructor<Id extends GenericHaywireId> = Id extends HaywireId<
    unknown,
    infer U extends GenericClass,
    string | symbol | null,
    boolean,
    boolean,
    'async' | boolean,
    boolean
>
    ? U extends AbstractPrivateClass
        ? null
        : U
    : null;

/**
 * Given the output id of a declared binding, produce the set of all output ids.
 *
 * e.g. If the provided output is `A + nullable + lateBinding`,
 * then the output ids would be:
 * > `A + nullable`
 * > `A + nullable + undefinable`
 *
 * It would omit the lateBinding (and supplier) totally.
 * It would also not be able to produce _just_ `A` or `A + undefinable`
 *
 * @template OutputId output declared binding
 */
export type ExpandOutputId<OutputId extends GenericHaywireId> = HaywireId<
    OutputId[typeof idType],
    OutputId['construct'],
    OutputId['annotations']['named'],
    true | OutputId['annotations']['nullable'],
    true | OutputId['annotations']['undefinable'],
    false,
    false
>;

/**
 * Expand an output id (no supplier or late binding) into all possible versions of output id
 * that can be requested and satisfied by the original.
 *
 * @param id - output id that is the _strictest_ of the result set
 * @returns set of output ids
 */
export const expandOutputId = <OutputId extends GenericHaywireId>(
    id: OutputId
): Set<ExpandOutputId<OutputId>> => {
    const expandedIds = new Set<ExpandOutputId<OutputId>>();
    const outputId = id.supplier(false).lateBinding(false);

    for (const nullable of [false, true]) {
        for (const undefinable of [false, true]) {
            let expandedId = outputId;
            if (nullable) {
                expandedId = expandedId.nullable();
            }
            if (undefinable) {
                expandedId = expandedId.undefinable();
            }
            expandedIds.add(expandedId);
        }
    }
    return expandedIds;
};
