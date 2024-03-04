import type {
    AsyncSupplier,
    GenericClass,
    InstanceOfClass,
    InvalidInput,
    IsClass,
    LateBinding,
    LiteralStringType,
    Supplier,
} from '#types';

export type ClassToConstructable<T extends IsClass> = T extends GenericClass<
    infer U
>
    ? HaystackId<U, T, null, false, false, false, false>
    : HaystackId<InstanceOfClass<T>, null, null, false, false, false, false>;

const classToIdCache = new WeakMap<
    GenericClass,
    HaystackId<any, any, any, any, any, any, any>
>();

type AllAnnotations = 'nullable' | 'undefinable' | 'supplier' | 'latebinding';
type StripNullable<
    T,
    A extends AllAnnotations = 'nullable',
> = 'nullable' extends A ? ([T] extends [null | infer U] ? U : T) : T;
type StripUndefinable<
    T,
    A extends AllAnnotations = 'undefinable',
> = 'undefinable' extends A ? ([T] extends [undefined | infer U] ? U : T) : T;
type StripSupplier<
    T,
    A extends AllAnnotations = 'supplier',
> = 'supplier' extends A
    ? [T] extends [Supplier<infer U>]
        ? U
        : [T] extends [AsyncSupplier<infer U>]
          ? U
          : T
    : T;
type StripLateBinding<
    T,
    A extends AllAnnotations = 'latebinding',
> = 'latebinding' extends A ? ([T] extends [LateBinding<infer U>] ? U : T) : T;
export type StripAnnotations<
    T,
    A extends AllAnnotations = AllAnnotations,
> = StripNullable<
    StripUndefinable<StripSupplier<StripLateBinding<T, A>, A>, A>,
    A
>;

export type ExtraAnnotations<T> = [T] extends [StripAnnotations<T>]
    ? []
    : [InvalidInput<'ExtraAnnotations'>];

interface UnsafeIdentifierGenerator {
    // idempotent
    <T extends GenericHaystackId>(id: T): T;
    <T extends IsClass>(clazz: T): ClassToConstructable<T>;
    <T>(
        name?: string
    ): HaystackId<StripAnnotations<T>, null, null, false, false, false, false>;
}

type SupplierProp<T extends boolean | 'async'> = T extends false
    ? T
    : {
          sync: T extends 'async' ? false : true;
          propagateScope: boolean;
      };

interface Annotations<
    Named extends string | symbol | null,
    Nullable extends boolean,
    Undefinable extends boolean,
    Supply extends boolean | 'async',
    LateBind extends boolean,
> {
    readonly named: Named;
    readonly nullable: Nullable;
    readonly undefinable: Undefinable;
    readonly supplier: SupplierProp<Supply>;
    readonly lateBinding: LateBind;
}

declare const idType: unique symbol;
const unsafeIdSym = Symbol('unsafeIdentifier');

export class HaystackId<
    T,
    Constructor extends GenericClass<T> | null,
    Named extends string | symbol | null,
    Nullable extends boolean,
    Undefinable extends boolean,
    Supply extends boolean | 'async',
    LateBind extends boolean,
> {
    public declare readonly [idType]: T;
    readonly #childIds: Map<
        string,
        HaystackId<any, any, any, any, any, any, any>
    >;

    private constructor(
        public readonly id: string,
        public readonly construct: Constructor,
        public readonly annotations: Annotations<
            Named,
            Nullable,
            Undefinable,
            Supply,
            LateBind
        > = {
            named: null as Named,
            nullable: false as Nullable,
            undefinable: false as Undefinable,
            supplier: false as SupplierProp<Supply>,
            lateBinding: false as LateBind,
        },
        childIds: Map<
            string,
            HaystackId<any, any, any, any, any, any, any>
        > = new Map()
    ) {
        this.#childIds = childIds;
        this.#childIds.set(HaystackId.#annotationKey(annotations), this);
    }

    #baseId: HaystackId<
        T,
        Constructor,
        Named,
        false,
        false,
        false,
        false
    > | null = null;
    public baseId(): HaystackId<
        T,
        Constructor,
        Named,
        false,
        false,
        false,
        false
    > {
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

    static readonly #symToRand = new WeakMap<symbol, string>();
    static #pseudoRandTracker = 0;
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
        const val = (++this.#pseudoRandTracker).toString(36);
        this.#symToRand.set(named, val);
        return val;
    }
    static #annotationKey({
        named,
        nullable,
        undefinable,
        supplier,
        lateBinding,
    }: Annotations<
        string | symbol | null,
        boolean,
        boolean,
        boolean | 'async',
        boolean
    >): string {
        const key = JSON.stringify([
            named,
            nullable,
            undefinable,
            supplier,
            lateBinding,
        ]);
        if (typeof named === 'symbol') {
            // Stringified symbols becomes null, so need to attach extra metadata to account for symbol value
            return this.#getSymRand(named) + key;
        }
        return key;
    }

    #extend<
        Named2 extends string | symbol | null,
        Nullable2 extends boolean,
        Undefinable2 extends boolean,
        Supply2 extends boolean | 'async',
        LateBind2 extends boolean,
    >(
        annotations: Annotations<
            Named2,
            Nullable2,
            Undefinable2,
            Supply2,
            LateBind2
        >
    ): HaystackId<
        T,
        Constructor,
        Named2,
        Nullable2,
        Undefinable2,
        Supply2,
        LateBind2
    > {
        const existing = this.#childIds.get(
            HaystackId.#annotationKey(annotations)
        );
        if (existing) {
            return existing;
        }

        return new HaystackId(
            this.id,
            this.construct,
            annotations,
            this.#childIds
        );
    }

    public named(
        name?: null
    ): HaystackId<
        T,
        Constructor,
        null,
        Nullable,
        Undefinable,
        Supply,
        LateBind
    >;
    public named<NewName extends string | symbol>(
        named: NewName,
        ...invalidInput: LiteralStringType<NewName>
    ): HaystackId<
        T,
        Constructor,
        NewName,
        Nullable,
        Undefinable,
        Supply,
        LateBind
    >;
    public named(named: string | symbol | null = null) {
        if (this.annotations.named === named) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            named,
        });
    }

    public nullable(
        nullable: false
    ): HaystackId<T, Constructor, Named, false, Undefinable, Supply, LateBind>;
    public nullable(
        nullable?: true
    ): HaystackId<T, Constructor, Named, true, Undefinable, Supply, LateBind>;
    public nullable(nullable: boolean = true) {
        if (this.annotations.nullable === nullable) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            nullable,
        });
    }

    public undefinable(
        undefinable: false
    ): HaystackId<T, Constructor, Named, Nullable, false, Supply, LateBind>;
    public undefinable(
        undefinable?: true
    ): HaystackId<T, Constructor, Named, Nullable, true, Supply, LateBind>;
    public undefinable(undefinable: boolean = true) {
        if (this.annotations.undefinable === undefinable) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            undefinable,
        });
    }

    public supplier(
        supplier: false
    ): HaystackId<
        T,
        Constructor,
        Named,
        Nullable,
        Undefinable,
        false,
        LateBind
    >;
    public supplier(
        supplier?:
            | true
            | {
                  sync: true;
                  propagateScope: boolean;
              }
    ): HaystackId<T, Constructor, Named, Nullable, Undefinable, true, LateBind>;
    public supplier(
        supplier:
            | 'async'
            | {
                  sync: false;
                  propagateScope: boolean;
              }
    ): HaystackId<
        T,
        Constructor,
        Named,
        Nullable,
        Undefinable,
        'async',
        LateBind
    >;
    public supplier(
        supplier:
            | boolean
            | 'async'
            | {
                  sync: boolean;
                  propagateScope: boolean;
              } = true
    ) {
        const supplierContext =
            supplier &&
            (typeof supplier === 'object'
                ? supplier
                : { sync: supplier === true, propagateScope: false });

        if (this.annotations.supplier === supplier) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            supplier: supplierContext,
        });
    }

    public lateBinding(
        lateBinding: false
    ): HaystackId<T, Constructor, Named, Nullable, Undefinable, Supply, false>;
    public lateBinding(
        lateBinding?: true
    ): HaystackId<T, Constructor, Named, Nullable, Undefinable, Supply, true>;
    public lateBinding(lateBinding: boolean = true) {
        if (this.annotations.lateBinding === lateBinding) {
            return this;
        }
        return this.#extend({
            ...this.annotations,
            lateBinding,
        });
    }

    public static [unsafeIdSym]: UnsafeIdentifierGenerator = <
        T,
        Constructor extends GenericClass<T> | null = null,
        Named extends string | symbol | null = null,
    >(
        idOrNameOrClass?:
            | string
            | GenericClass<T>
            | HaystackId<T, Constructor, Named, false, false, false, false>
    ): HaystackId<T, Constructor, Named, false, false, false, false> => {
        // idempotency
        if (idOrNameOrClass instanceof HaystackId) {
            return idOrNameOrClass;
        }

        if (idOrNameOrClass) {
            if (typeof idOrNameOrClass === 'string') {
                return new HaystackId<
                    T,
                    Constructor,
                    Named,
                    false,
                    false,
                    false,
                    false
                >(idOrNameOrClass, null as Constructor);
            }

            const cachedId = classToIdCache.get(idOrNameOrClass);
            if (cachedId) {
                return cachedId;
            }
            const id = new HaystackId<
                T,
                Constructor,
                Named,
                false,
                false,
                false,
                false
            >(idOrNameOrClass.name, idOrNameOrClass as Constructor);
            classToIdCache.set(idOrNameOrClass, id);
            return id;
        }

        return new HaystackId<
            T,
            Constructor,
            Named,
            false,
            false,
            false,
            false
        >('haystack-id', null as Constructor);
    };
}

export const unsafeIdentifier = HaystackId[unsafeIdSym];
delete (HaystackId as Record<typeof unsafeIdSym, unknown>)[unsafeIdSym];

export type GenericHaystackId = HaystackId<
    unknown,
    GenericClass | null,
    string | symbol | null,
    boolean,
    boolean,
    boolean | 'async',
    boolean
>;
export type GenericOutputHaystackId = HaystackId<
    unknown,
    GenericClass | null,
    string | symbol | null,
    boolean,
    boolean,
    false,
    false
>;

type HaystackIdTypeNullable<Id extends GenericHaystackId> =
    Id['annotations']['nullable'] extends true
        ? Id[typeof idType] | null
        : Id[typeof idType];
type HaystackIdTypeUndefinable<Id extends GenericHaystackId> =
    Id['annotations']['undefinable'] extends true
        ? HaystackIdTypeNullable<Id> | undefined
        : HaystackIdTypeNullable<Id>;
type HaystackIdTypeSupplier<Id extends GenericHaystackId> =
    Id['annotations']['supplier'] extends { sync: infer U }
        ? U extends true
            ? Supplier<HaystackIdTypeUndefinable<Id>>
            : AsyncSupplier<HaystackIdTypeUndefinable<Id>>
        : HaystackIdTypeUndefinable<Id>;
export type HaystackIdType<Id extends GenericHaystackId> =
    Id['annotations']['lateBinding'] extends true
        ? LateBinding<HaystackIdTypeSupplier<Id>>
        : HaystackIdTypeSupplier<Id>;

export type HaystackIdConstructor<Id extends GenericHaystackId> =
    Id extends HaystackId<
        unknown,
        infer U,
        string | symbol | null,
        boolean,
        boolean,
        boolean | 'async',
        boolean
    >
        ? U extends GenericClass
            ? U
            : null
        : null;
