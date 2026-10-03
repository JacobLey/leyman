import type {
    ClassToConstructable,
    GenericHaywireId,
    GenericOutputHaywireId,
    HaywireId,
    HaywireIdConstructor,
    HaywireIdProviderType,
    HaywireIdType,
    OutputHaywireId,
    RawType,
    StripAnnotations,
} from '#identifier';
import type { Scopes } from '#scopes';
import type {
    AsyncSupplier,
    Deferred,
    DepsClass,
    ExpandOutput,
    ExtendsType,
    GenericClass,
    InvalidInput,
    IsClass,
    LiteralStringType,
    MultiList,
    Names,
    Supplier,
} from '#types';
import { HaywireProviderMissingError } from '#errors';
import { unsafeIdentifier } from '#identifier';
import { eagerSingletonScope, transientScope } from '#scopes';

export type DependencyIdTypes<Dependencies extends readonly [...GenericHaywireId[]]> = {
    [Index in keyof Dependencies]: HaywireIdType<Dependencies[Index]>;
};
export type GenericBinding = Binding<GenericOutputHaywireId, any, boolean>;

/**
 * Given the output id of a declared binding, produce the set of all output types.
 *
 * e.g. If the provided output is `A + nullable + deferred`,
 * then the output types would be:
 * > `A + nullable`
 * > `A + nullable + undefinable`
 *
 * It would omit the deferred (and supplier) totally.
 * It would also not be able to produce _just_ `A` or `A + undefinable`
 *
 * Only returns data for non-list (see {@link BindingListOutputType} for equivalent).
 *
 * @template OutputId output declared in binding
 */
export type BindingOutputType<OutputId extends GenericOutputHaywireId> =
    OutputId extends HaywireId<
        infer BaseType,
        infer Construct,
        infer Named,
        false,
        infer Nullable,
        infer Undefinable,
        'async' | boolean,
        boolean
    >
        ? ExpandOutput<BaseType, Construct, Named, false, Nullable, Undefinable>
        : never;

/**
 * List version of {@link BindingOutputType}
 *
 * @template OutputId output declared in binding
 */
export type BindingListOutputType<OutputId extends GenericOutputHaywireId> =
    OutputId extends HaywireId<
        infer BaseType,
        infer Construct,
        infer Named,
        true,
        infer Nullable,
        infer Undefinable,
        'async' | boolean,
        boolean
    >
        ? ExpandOutput<BaseType, Construct, Named, true, Nullable, Undefinable>
        : never;

type NormalizedOutputId<T extends GenericHaywireId> = HaywireId<
    RawType<T>,
    T['construct'],
    T['annotations']['named'],
    T['annotations']['list'] extends 'multi' | true ? true : false,
    T['annotations']['nullable'],
    T['annotations']['undefinable'],
    false,
    false
>;
export const normalizeOutputId = <T extends GenericHaywireId>(id: T): NormalizedOutputId<T> =>
    id
        .supplier(false)
        .deferred(false)
        .list((id.annotations.list !== false) as false) as NormalizedOutputId<T>;

const providerToMaybeList = <
    OutputId extends GenericHaywireId,
    Dependencies extends readonly [...GenericHaywireId[]],
    Async extends boolean,
>(
    id: OutputId,
    isAsync: Async,
    provider: (
        ...deps: DependencyIdTypes<Dependencies>
    ) => Async extends true
        ? HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>
        : HaywireIdProviderType<OutputId>
): ((
    ...deps: DependencyIdTypes<Dependencies>
) => Async extends true
    ? HaywireIdType<OutputHaywireId<OutputId>> | Promise<HaywireIdType<OutputHaywireId<OutputId>>>
    : HaywireIdType<OutputHaywireId<OutputId>>) => {
    type WrappedProvider = (
        ...deps: DependencyIdTypes<Dependencies>
    ) => Async extends true
        ?
              | HaywireIdType<OutputHaywireId<OutputId>>
              | Promise<HaywireIdType<OutputHaywireId<OutputId>>>
        : HaywireIdType<OutputHaywireId<OutputId>>;

    const { list } = id.annotations;
    if (list === false) {
        return provider as WrappedProvider;
    }
    // `list: true` providers emit a single element.
    // `list: 'multi'` providers emit an array, except for `null`/`undefined` which is treated as a single element.
    const toList = (result: unknown): unknown =>
        list === true || result === null || result === undefined ? [result] : result;

    if (isAsync) {
        return (async (...deps) =>
            toList(await (provider(...deps) as Promise<unknown>))) as WrappedProvider;
    }
    return ((...deps) => toList(provider(...deps))) as WrappedProvider;
};

/**
 * A provider that declares it's dependencies and output type.
 * Both dependencies and outputs are declared as identifiers, _or_ a class constructor.
 *
 * The provider function must intake the dependencies and return the output.
 * Asynchronous providers should be declared explicitly, so containers can properly detect when synchronous generation is not possible.
 *
 * If the output may be not be available (such as loading a resource that may not exist),
 * the output should be declared as nullable/undefinable to match the possible return value.
 *
 * Similarly any dependencies should be declared as nullable/undefinable in order to handle the possible values, or else
 * container validation will fail.
 *
 * @template OutputId
 * @template Dependencies
 * @template Async
 */
export class Binding<
    OutputId extends GenericOutputHaywireId,
    Dependencies extends readonly [...GenericHaywireId[]],
    Async extends boolean,
> implements GenericBinding
{
    public readonly outputId: OutputId;
    public readonly depIds: readonly [...Dependencies];
    public readonly isAsync: Async;
    public readonly provider: (
        ...deps: DependencyIdTypes<Dependencies>
    ) => Async extends true
        ? HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>
        : HaywireIdType<OutputId>;
    public readonly scope: Scopes = transientScope;

    /**
     * @param outputId - identifier of type returned by provider
     * @param depIds - list of dependency types, in order that will be passed to provider
     * @param isAsync - flag to indicate provider returns a promise of the output id
     * @param provider - method to calculate output id based on dependencies. If `isAsync=true`, can return a promise
     * @param [scope=transientScope] - scope to use for provider. Allows caching of value between invocations.
     */
    public constructor(
        outputId: OutputId,
        depIds: readonly [...Dependencies],
        isAsync: Async,
        provider: (
            ...deps: DependencyIdTypes<Dependencies>
        ) => Async extends true
            ? HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>
            : HaywireIdType<OutputId>,
        scope: Scopes = transientScope
    ) {
        this.outputId = outputId;
        this.provider = provider;
        this.scope = scope;
        this.depIds = depIds;
        this.isAsync = isAsync;
    }

    /**
     * Returns the dependency ids as a generic list.
     * Convenience method when working on the strict typings exposed by the attribute are not suitable.
     *
     * @returns list of dependencies as a generic type
     */
    public get dependencyIds(): readonly GenericHaywireId[] {
        return this.depIds;
    }

    /**
     * Creates a new binding with the set scope. Does not modify the existing immutable binding.
     *
     * @param scope - new scope to use
     * @returns new binding with scope
     */
    public scoped(scope: Scopes): this {
        if (scope === this.scope) {
            return this;
        }
        return new Binding(this.outputId, this.depIds, this.isAsync, this.provider, scope) as this;
    }

    /**
     * Creates a new binding with output set to the new name. Does not modify the existing immutable binding.
     *
     * @param [name] - new name to use
     * @returns new binding with output with name
     */
    public named(
        name?: null
    ): Binding<
        HaywireId<
            RawType<this['outputId']>,
            this['outputId']['construct'],
            null,
            this['outputId']['annotations']['list'],
            this['outputId']['annotations']['nullable'],
            this['outputId']['annotations']['undefinable'],
            false,
            false
        >,
        Dependencies,
        Async
    >;
    public named<NewName extends string | symbol>(
        named: NewName,
        ...invalidInput: LiteralStringType<NewName>
    ): Binding<
        HaywireId<
            RawType<this['outputId']>,
            this['outputId']['construct'],
            NewName,
            this['outputId']['annotations']['list'],
            this['outputId']['annotations']['nullable'],
            this['outputId']['annotations']['undefinable'],
            false,
            false
        >,
        Dependencies,
        Async
    >;
    public named(named: Names = null): GenericBinding {
        if (this.outputId.annotations.named === named) {
            return this as Binding<
                HaywireId<
                    RawType<this['outputId']>,
                    this['outputId']['construct'],
                    Names,
                    this['outputId']['annotations']['list'],
                    this['outputId']['annotations']['nullable'],
                    this['outputId']['annotations']['undefinable'],
                    false,
                    false
                >,
                Dependencies,
                Async
            >;
        }
        return new Binding(
            this.outputId.named(named as ''),
            this.depIds,
            this.isAsync,
            this.provider as Binding<any, any, any>['provider']
        );
    }

    /**
     * Set the output id of the provider to nullable, even if the provider itself is not expected to return null.
     * Useful for future proofing where a value _should_ be treated as nullable even though it is not currently the case.
     *
     * @param [val=true] - supports setting a value for consistency with other APIs and clarity, but is otherwise ignored
     * @returns new binding with output id set to nullable. Does not mutate existing binding.
     */
    public nullable(
        val?: true
    ): Binding<
        HaywireId<
            RawType<this['outputId']>,
            this['outputId']['construct'],
            this['outputId']['annotations']['named'],
            this['outputId']['annotations']['list'],
            true,
            this['outputId']['annotations']['undefinable'],
            false,
            false
        >,
        Dependencies,
        Async
    >;
    public nullable(): GenericBinding {
        if (this.outputId.annotations.nullable) {
            return this as Binding<
                HaywireId<
                    RawType<this['outputId']>,
                    this['outputId']['construct'],
                    this['outputId']['annotations']['named'],
                    this['outputId']['annotations']['list'],
                    true,
                    this['outputId']['annotations']['undefinable'],
                    false,
                    false
                >,
                Dependencies,
                Async
            >;
        }
        return new Binding(
            this.outputId.nullable(),
            this.depIds,
            this.isAsync,
            this.provider as Binding<any, any, any>['provider']
        );
    }

    /**
     * Set the output id of the provider to undefinable, even if the provider itself is not expected to return undefined.
     * Useful for future proofing where a value _should_ be treated as undefinable even though it is not currently the case.
     *
     * @param [val=true] - supports setting a value for consistency with other APIs and clarity, but is otherwise ignored
     * @returns new binding with output id set to undefinable. Does not mutate existing binding.
     */
    public undefinable(
        val?: true
    ): Binding<
        HaywireId<
            RawType<this['outputId']>,
            this['outputId']['construct'],
            this['outputId']['annotations']['named'],
            this['outputId']['annotations']['list'],
            this['outputId']['annotations']['nullable'],
            true,
            false,
            false
        >,
        Dependencies,
        Async
    >;
    public undefinable(): GenericBinding {
        if (this.outputId.annotations.undefinable) {
            return this as Binding<
                HaywireId<
                    RawType<this['outputId']>,
                    this['outputId']['construct'],
                    this['outputId']['annotations']['named'],
                    this['outputId']['annotations']['list'],
                    this['outputId']['annotations']['nullable'],
                    true,
                    false,
                    false
                >,
                Dependencies,
                Async
            >;
        }
        return new Binding(
            this.outputId.undefinable(),
            this.depIds,
            this.isAsync,
            this.provider as Binding<any, any, any>['provider']
        );
    }

    /**
     * Set the output id of the provider to list, even if the provider itself is returning a single instance.
     * Useful for converting a single-value provider to merge with other providers of the same time.
     *
     * @param [val=true] - supports setting a value for consistency with other APIs and clarity, but is otherwise ignored
     * @returns new binding with output id set to list. Does not mutate existing binding.
     */
    public list(
        val?: true
    ): Binding<
        HaywireId<
            RawType<this['outputId']>,
            this['outputId']['construct'],
            this['outputId']['annotations']['named'],
            true,
            this['outputId']['annotations']['nullable'],
            this['outputId']['annotations']['undefinable'],
            false,
            false
        >,
        Dependencies,
        Async
    >;
    public list(): GenericBinding {
        if (this.outputId.annotations.list) {
            return this as Binding<
                HaywireId<
                    RawType<this['outputId']>,
                    this['outputId']['construct'],
                    this['outputId']['annotations']['named'],
                    true,
                    this['outputId']['annotations']['nullable'],
                    this['outputId']['annotations']['undefinable'],
                    false,
                    false
                >,
                Dependencies,
                Async
            >;
        }
        const outputId = this.outputId.list();
        return new Binding(
            outputId,
            this.depIds,
            this.isAsync,
            providerToMaybeList(outputId, this.isAsync, this.provider)
        );
    }
}

/**
 * Temporary binding used internally by factory to appease container validation
 * until actual instance can be bound.
 *
 * @template OutputId
 */
export class TempBinding<OutputId extends GenericOutputHaywireId> extends Binding<
    OutputId,
    [],
    false
> {
    public constructor(outputId: OutputId) {
        super(
            outputId,
            [],
            false,
            () => {
                throw new HaywireProviderMissingError([outputId]);
            },
            eagerSingletonScope
        );
    }
}

/**
 * Actual binding used to replace TempBinding.
 *
 * @template OutputId
 */
export class InstanceBinding<OutputId extends GenericHaywireId> extends Binding<
    OutputHaywireId<OutputId>,
    [],
    false
> {
    public constructor(outputId: OutputId, instance: HaywireIdProviderType<OutputId>) {
        super(
            normalizeOutputId(outputId),
            [],
            false,
            providerToMaybeList(outputId, false, () => instance),
            eagerSingletonScope
        );
    }
}

type IdOrClassToIds<Dependencies extends readonly (GenericHaywireId | IsClass)[]> = {
    [Index in keyof Dependencies]: Dependencies[Index] extends IsClass
        ? ClassToConstructable<Dependencies[Index]>
        : Dependencies[Index] extends GenericHaywireId
          ? Dependencies[Index]
          : never;
};

type ExtendsPromise<T> = T extends Promise<unknown> ? true : false;
type AsyncPromiseOutput<OutputId extends GenericHaywireId> =
    true extends ExtendsPromise<HaywireIdProviderType<OutputId>>
        ? [InvalidInput<'AsyncPromiseResponse'>]
        : [];

const idOrClassToIds = <Dependencies extends readonly (GenericHaywireId | IsClass)[]>(
    ids: [...Dependencies]
): IdOrClassToIds<Dependencies> =>
    ids.map(id => unsafeIdentifier(id as GenericHaywireId)) as IdOrClassToIds<Dependencies>;

/**
 * Binding builder that has output + dependencies, and needs the provider.
 * Contains optional helper methods to auto-generate the provider, or flag it as async.
 *
 * @template OutputId
 * @template DependencyIds
 */
export class DepsBindingBuilder<
    OutputId extends GenericHaywireId,
    DependencyIds extends readonly [...GenericHaywireId[]],
> {
    readonly #outputId: OutputId;
    readonly #depIds: DependencyIds;
    /**
     * @param outputId - output identifier
     * @param depIds - dependency ids, in order that will be passed to provider
     */
    public constructor(outputId: OutputId, depIds: DependencyIds) {
        this.#outputId = outputId;
        this.#depIds = depIds;
    }

    public withConstructorProvider(
        ...invalidInput: ExtendsType<
            HaywireIdConstructor<OutputId>,
            DepsClass<RawType<OutputId>, DependencyIdTypes<DependencyIds>>
        >
    ): Binding<OutputHaywireId<OutputId>, DependencyIds, false>;
    public withConstructorProvider(): Binding<OutputHaywireId<OutputId>, DependencyIds, false> {
        const normalized = normalizeOutputId(this.#outputId);
        return new Binding(
            normalized,
            this.#depIds,
            false,
            providerToMaybeList(
                normalized,
                false,
                ((...deps: DependencyIdTypes<DependencyIds>) =>
                    new (
                        this.#outputId.construct as DepsClass<
                            RawType<OutputId>,
                            DependencyIdTypes<DependencyIds>
                        >
                    )(...deps)) as (
                    ...deps: DependencyIdTypes<DependencyIds>
                ) => HaywireIdProviderType<NormalizedOutputId<OutputId>>
            )
        );
    }

    public withProvider(
        provider: (...deps: DependencyIdTypes<DependencyIds>) => HaywireIdProviderType<OutputId>
    ): Binding<OutputHaywireId<OutputId>, DependencyIds, false> {
        return new Binding(
            normalizeOutputId(this.#outputId),
            this.#depIds,
            false,
            providerToMaybeList(this.#outputId, false, provider)
        );
    }

    public withAsyncProvider(
        provider: (
            ...deps: DependencyIdTypes<DependencyIds>
        ) => HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>,
        ...invalidInput: AsyncPromiseOutput<OutputId> & []
    ): Binding<OutputHaywireId<OutputId>, DependencyIds, true>;
    public withAsyncProvider(
        provider: (
            ...deps: DependencyIdTypes<DependencyIds>
        ) => HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>
    ): Binding<OutputHaywireId<OutputId>, DependencyIds, true> {
        return new Binding(
            normalizeOutputId(this.#outputId),
            this.#depIds,
            true,
            providerToMaybeList(this.#outputId, true, provider)
        );
    }
}

type DependenciesToIds<Dependencies extends readonly unknown[]> = {
    [Index in keyof Dependencies]: HaywireId<
        StripAnnotations<Dependencies[Index]>,
        GenericClass<StripAnnotations<Dependencies[Index]>> | null,
        string | symbol | null,
        StripAnnotations<Dependencies[Index], 'deferred' | 'supplier'> extends MultiList<unknown>
            ? 'multi' | true
            : false,
        null extends StripAnnotations<Dependencies[Index], 'deferred' | 'list' | 'supplier'>
            ? boolean
            : false,
        undefined extends StripAnnotations<Dependencies[Index], 'deferred' | 'list' | 'supplier'>
            ? boolean
            : false,
        StripAnnotations<Dependencies[Index], 'deferred'> extends Supplier<unknown>
            ? true
            : StripAnnotations<Dependencies[Index], 'deferred'> extends AsyncSupplier<unknown>
              ? 'async'
              : false,
        Dependencies[Index] extends Deferred<unknown> ? true : false
    >;
};

type DependenciesMisMatch<
    DependencyIds extends readonly (GenericHaywireId | IsClass)[],
    Dependencies extends readonly unknown[],
> =
    IdOrClassToIds<DependencyIds> extends DependenciesToIds<Dependencies>
        ? []
        : [InvalidInput<'DependenciesMismatch'>];

/**
 * Binding builder that has output + provider, and needs the dependencies.
 *
 * Note that despite the fact that _typescript_ knows the dependency types, _javascript_ does not.
 * So it is always necessary to provide the dependency ids or classes, in the order they will be passed to the provider.
 *
 * @template OutputId
 * @template Dependencies
 */
export class ProviderBindingBuilder<
    OutputId extends GenericHaywireId,
    Dependencies extends readonly unknown[],
> {
    readonly #outputId: OutputId;
    readonly #provider: (...deps: [...Dependencies]) => HaywireIdProviderType<OutputId>;

    public constructor(
        outputId: OutputId,
        provider: (...deps: [...Dependencies]) => HaywireIdProviderType<OutputId>
    ) {
        this.#outputId = outputId;
        this.#provider = provider;
    }

    public withDependencies<DependencyIds extends readonly (GenericHaywireId | IsClass)[]>(
        depIds: [...DependencyIds],
        ...invalidInput: DependenciesMisMatch<DependencyIds, Dependencies> & []
    ): Binding<OutputHaywireId<OutputId>, IdOrClassToIds<DependencyIds>, false>;
    public withDependencies<DependencyIds extends readonly (GenericHaywireId | IsClass)[]>(
        depIds: [...DependencyIds]
    ): Binding<OutputHaywireId<OutputId>, IdOrClassToIds<DependencyIds>, false> {
        return new Binding(
            normalizeOutputId(this.#outputId),
            idOrClassToIds(depIds),
            false,
            providerToMaybeList(
                this.#outputId,
                false,
                this.#provider as (
                    ...args: DependencyIdTypes<IdOrClassToIds<DependencyIds>>
                ) => HaywireIdProviderType<OutputId>
            )
        );
    }
}

/**
 * Binding builder that has output + async provider, and needs the dependencies.
 *
 * Note that despite the fact that _typescript_ knows the dependency types, _javascript_ does not.
 * So it is always necessary to provide the dependency ids or classes, in the order they will be passed to the provider.
 *
 * @template OutputId
 * @template Dependencies
 */
export class AsyncProviderBindingBuilder<
    OutputId extends GenericHaywireId,
    Dependencies extends readonly unknown[],
> {
    readonly #outputId: OutputId;
    readonly #provider: (
        ...deps: [...Dependencies]
    ) => HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>;

    public constructor(
        outputId: OutputId,
        provider: (
            ...deps: [...Dependencies]
        ) => HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>
    ) {
        this.#outputId = outputId;
        this.#provider = provider;
    }

    public withDependencies<DependencyIds extends readonly (GenericHaywireId | IsClass)[]>(
        depIds: [...DependencyIds],
        ...invalidInput: DependenciesMisMatch<DependencyIds, Dependencies> & []
    ): Binding<OutputHaywireId<OutputId>, IdOrClassToIds<DependencyIds>, true>;
    public withDependencies<DependencyIds extends readonly (GenericHaywireId | IsClass)[]>(
        depIds: [...DependencyIds]
    ): Binding<OutputHaywireId<OutputId>, IdOrClassToIds<DependencyIds>, true> {
        return new Binding(
            normalizeOutputId(this.#outputId),
            idOrClassToIds(depIds),
            true,
            providerToMaybeList(
                this.#outputId,
                true,
                this.#provider as (
                    ...args: DependencyIdTypes<IdOrClassToIds<DependencyIds>>
                ) => Promise<HaywireIdProviderType<OutputId>>
            )
        );
    }
}

type MissingConstructorInput = [InvalidInput<'MissingConstructorInput'>];
type MissingConstructorType<T extends GenericHaywireId> =
    null extends HaywireIdConstructor<T> ? MissingConstructorInput : [];

/**
 * Binding builder that only has the output id.
 *
 * Contains helper methods to chain the dependency ids and providers with strong typing.
 * Can optionally omit dependency ids and providers in special cases such as no dependencies
 * or using the constructor as the provider.
 *
 * @template OutputId
 */
export class BindingBuilder<OutputId extends GenericHaywireId> {
    readonly #outputId: OutputId;

    public constructor(outputId: OutputId) {
        this.#outputId = outputId;
    }

    public withInstance(
        value: HaywireIdProviderType<OutputId>
    ): Binding<OutputHaywireId<OutputId>, [], false> {
        return new Binding(
            normalizeOutputId(this.#outputId),
            [],
            false,
            providerToMaybeList(this.#outputId, false, () => value),
            eagerSingletonScope
        );
    }

    public withConstructorFactory(
        ...invalidInput: ExtendsType<
            HaywireIdConstructor<OutputId>,
            DepsClass<HaywireIdProviderType<OutputHaywireId<OutputId>>, []>
        >
    ): Binding<OutputHaywireId<OutputId>, [], false>;
    public withConstructorFactory(): Binding<OutputHaywireId<OutputId>, [], false> {
        const normalized = normalizeOutputId(this.#outputId);
        return new Binding(
            normalized,
            [],
            false,
            providerToMaybeList(
                normalized,
                false,
                () =>
                    new (
                        this.#outputId.construct as DepsClass<RawType<OutputId>, []>
                    )() as HaywireIdProviderType<NormalizedOutputId<OutputId>>
            )
        );
    }

    public withFactory(
        provider: () => HaywireIdProviderType<OutputId>
    ): Binding<OutputHaywireId<OutputId>, [], false> {
        return new Binding(
            normalizeOutputId(this.#outputId),
            [],
            false,
            providerToMaybeList(this.#outputId, false, provider)
        );
    }

    public withAsyncFactory(
        provider: () => HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>,
        ...invalidInput: AsyncPromiseOutput<OutputId> & []
    ): Binding<OutputHaywireId<OutputId>, [], true>;
    public withAsyncFactory(
        provider: () => HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>
    ): Binding<OutputHaywireId<OutputId>, [], true> {
        return new Binding(
            normalizeOutputId(this.#outputId),
            [],
            true,
            providerToMaybeList(this.#outputId, true, provider)
        );
    }

    public withDependencies<Dependencies extends readonly (GenericHaywireId | IsClass)[]>(
        dependencyIds: [...Dependencies]
    ): DepsBindingBuilder<OutputId, IdOrClassToIds<Dependencies>> {
        return new DepsBindingBuilder(this.#outputId, idOrClassToIds(dependencyIds));
    }

    public withConstructorProvider(
        ...invalidInput: MissingConstructorType<OutputId>
    ): ProviderBindingBuilder<
        OutputId,
        ConstructorParameters<NonNullable<HaywireIdConstructor<OutputId>>>
    >;
    public withConstructorProvider(): ProviderBindingBuilder<
        OutputId,
        ConstructorParameters<NonNullable<HaywireIdConstructor<OutputId>>>
    > {
        return new ProviderBindingBuilder(
            this.#outputId.list((this.#outputId.annotations.list !== false) as false),
            (...args) =>
                new (
                    this.#outputId.construct as DepsClass<
                        HaywireIdProviderType<OutputId>,
                        unknown[]
                    >
                )(...args)
        ) as ProviderBindingBuilder<
            OutputId,
            ConstructorParameters<NonNullable<HaywireIdConstructor<OutputId>>>
        >;
    }

    public withProvider<Dependencies extends readonly unknown[]>(
        provider: (...deps: [...Dependencies]) => HaywireIdProviderType<OutputId>
    ): ProviderBindingBuilder<OutputId, Dependencies> {
        return new ProviderBindingBuilder(this.#outputId, provider);
    }

    public withAsyncProvider<Dependencies extends readonly unknown[]>(
        provider: (
            ...deps: [...Dependencies]
        ) => HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>,
        ...invalidInput: AsyncPromiseOutput<OutputId> & []
    ): AsyncProviderBindingBuilder<OutputId, Dependencies>;
    public withAsyncProvider<Dependencies extends readonly unknown[]>(
        provider: (
            ...deps: [...Dependencies]
        ) => HaywireIdProviderType<OutputId> | Promise<HaywireIdProviderType<OutputId>>
    ): AsyncProviderBindingBuilder<OutputId, Dependencies> {
        return new AsyncProviderBindingBuilder(this.#outputId, provider);
    }
}
