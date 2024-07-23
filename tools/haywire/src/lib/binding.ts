import { HaywireProviderMissingError } from '#errors';
import {
    type ClassToConstructable,
    type GenericHaywireId,
    type GenericOutputHaywireId,
    type HaywireId,
    type HaywireIdConstructor,
    type HaywireIdType,
    type OutputHaywireId,
    type StripAnnotations,
    unsafeIdentifier,
} from '#identifier';
import { optimisticSingletonScope, type Scopes, transientScope } from '#scopes';
import type {
    DepsClass,
    ExpandOutput,
    ExtendsType,
    GenericClass,
    InvalidInput,
    IsClass,
    LateBinding,
    LiteralStringType,
    Supplier,
} from '#types';

export type DependencyIdTypes<Dependencies extends readonly [...GenericHaywireId[]]> = {
    [Index in keyof Dependencies]: HaywireIdType<Dependencies[Index]>;
};
export type GenericBinding = Binding<GenericOutputHaywireId, any, boolean>;

/**
 * Given the output id of a declared binding, produce the set of all output types.
 *
 * e.g. If the provided output is `A + nullable + lateBinding`,
 * then the output types would be:
 * > `A + nullable`
 * > `A + nullable + undefinable`
 *
 * It would omit the lateBinding (and supplier) totally.
 * It would also not be able to produce _just_ `A` or `A + undefinable`
 *
 * @template OutputId output declared binding
 */
export type BindingOutputType<OutputId extends GenericHaywireId> = OutputId extends HaywireId<
    infer BaseType,
    infer Construct,
    infer Named,
    infer Nullable,
    infer Undefinable,
    'async' | boolean,
    boolean
>
    ? ExpandOutput<BaseType, Construct, Named, Nullable, Undefinable>
    : never;

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
 */
export class Binding<
    OutputId extends GenericHaywireId,
    Dependencies extends readonly [...GenericHaywireId[]],
    Async extends boolean,
> {
    public readonly outputId: OutputHaywireId<OutputId>;
    public readonly depIds: readonly [...Dependencies];
    public readonly isAsync: Async;
    public readonly provider: (
        ...deps: DependencyIdTypes<Dependencies>
    ) => Async extends true
        ?
              | HaywireIdType<OutputHaywireId<OutputId>>
              | Promise<HaywireIdType<OutputHaywireId<OutputId>>>
        : HaywireIdType<OutputHaywireId<OutputId>>;
    public readonly scope: Scopes = transientScope;

    /**
     * @param outputId - identifer of type returned by provider
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
            ?
                  | HaywireIdType<OutputHaywireId<OutputId>>
                  | Promise<HaywireIdType<OutputHaywireId<OutputId>>>
            : HaywireIdType<OutputHaywireId<OutputId>>,
        scope: Scopes = transientScope
    ) {
        this.outputId = outputId.supplier(false).lateBinding(false);
        this.depIds = depIds;
        this.isAsync = isAsync;
        this.provider = provider;
        this.scope = scope;
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
    public scoped(scope: Scopes): Binding<OutputId, Dependencies, Async> {
        return new Binding(this.outputId, this.depIds, this.isAsync, this.provider, scope);
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
        this['outputId'] extends HaywireId<
            infer U,
            infer V,
            string | symbol | null,
            infer Nullable,
            infer Undefinable,
            false,
            false
        >
            ? HaywireId<U, V, null, Nullable, Undefinable, false, false>
            : never,
        Dependencies,
        Async
    >;
    public named<NewName extends string | symbol>(
        named: NewName,
        ...invalidInput: LiteralStringType<NewName>
    ): Binding<
        this['outputId'] extends HaywireId<
            infer U,
            infer V,
            string | symbol | null,
            infer Nullable,
            infer Undefinable,
            false,
            false
        >
            ? HaywireId<U, V, NewName, Nullable, Undefinable, false, false>
            : never,
        Dependencies,
        Async
    >;
    public named(named: string | symbol | null = null): GenericBinding {
        return new Binding(
            this.outputId.named(named as ''),
            this.depIds,
            this.isAsync,
            this.provider
        ) as Binding<
            this['outputId'] extends HaywireId<
                infer U,
                infer V,
                string | symbol | null,
                infer Nullable,
                infer Undefinable,
                false,
                false
            >
                ? HaywireId<U, V, string | symbol | null, Nullable, Undefinable, false, false>
                : never,
            Dependencies,
            Async
        >;
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
        this['outputId'] extends HaywireId<
            infer U,
            infer V,
            infer Named,
            boolean,
            infer Undefinable,
            false,
            false
        >
            ? HaywireId<U, V, Named, true, Undefinable, false, false>
            : never,
        Dependencies,
        Async
    >;
    public nullable(): GenericBinding {
        return new Binding(this.outputId.nullable(), this.depIds, this.isAsync, this.provider);
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
        this['outputId'] extends HaywireId<
            infer U,
            infer V,
            infer Named,
            infer Nullable,
            boolean,
            false,
            false
        >
            ? HaywireId<U, V, Named, Nullable, true, false, false>
            : never,
        Dependencies,
        Async
    >;
    public undefinable(): GenericBinding {
        return new Binding(this.outputId.undefinable(), this.depIds, this.isAsync, this.provider);
    }
}

/**
 * Temporary binding used internally by factor to appease container validation
 * until actual instance can be bound.
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
            optimisticSingletonScope
        );
    }
}

/**
 * Actual binding used to replace TempBinding.
 */
export class InstanceBinding<OutputId extends GenericOutputHaywireId> extends Binding<
    OutputId,
    [],
    false
> {
    public constructor(outputId: OutputId, instance: HaywireIdType<OutputId>) {
        super(outputId, [], false, () => instance, optimisticSingletonScope);
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
type AsyncPromiseOutput<OutputId extends GenericHaywireId> = true extends ExtendsPromise<
    HaywireIdType<OutputId>
>
    ? [InvalidInput<'AsyncPromiseResponse'>]
    : [];

const idOrClassToIds = <Dependencies extends readonly (GenericHaywireId | IsClass)[]>(
    ids: [...Dependencies]
): IdOrClassToIds<Dependencies> =>
    ids.map(id => unsafeIdentifier(id as GenericHaywireId)) as IdOrClassToIds<Dependencies>;

/**
 * Binding builder that has output + dependencies, and needs the provider.
 * Contains optional helper methods to auto-generate the provider, or flag it as async.
 */
export class DepsBindingBuilder<
    OutputId extends GenericOutputHaywireId,
    DependencyIds extends readonly [...GenericHaywireId[]],
> {
    readonly #outputId: OutputId;
    readonly #depIds: DependencyIds;
    /**
     * @param outputId - output identifer
     * @param depIds - dependency ids, in order that will be passed to provider
     */
    public constructor(outputId: OutputId, depIds: DependencyIds) {
        this.#outputId = outputId;
        this.#depIds = depIds;
    }

    public withConstructorProvider(
        ...invalidInput: ExtendsType<
            HaywireIdConstructor<OutputId>,
            DepsClass<HaywireIdType<OutputId>, DependencyIdTypes<DependencyIds>>
        >
    ): Binding<OutputId, DependencyIds, false>;
    public withConstructorProvider(): Binding<OutputId, DependencyIds, false> {
        return new Binding(
            this.#outputId,
            this.#depIds,
            false,
            (...deps: DependencyIdTypes<DependencyIds>) =>
                new (
                    this.#outputId.construct as DepsClass<
                        HaywireIdType<OutputId>,
                        DependencyIdTypes<DependencyIds>
                    >
                )(...deps)
        );
    }

    public withProvider(
        provider: (...deps: DependencyIdTypes<DependencyIds>) => HaywireIdType<OutputId>
    ): Binding<OutputId, DependencyIds, false> {
        return new Binding(this.#outputId, this.#depIds, false, provider);
    }

    public withAsyncProvider(
        provider: (
            ...deps: DependencyIdTypes<DependencyIds>
        ) => HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>,
        ...invalidInput: AsyncPromiseOutput<OutputId> & []
    ): Binding<OutputId, DependencyIds, true>;
    public withAsyncProvider(
        provider: (
            ...deps: DependencyIdTypes<DependencyIds>
        ) => HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>
    ): Binding<OutputId, DependencyIds, true> {
        return new Binding(this.#outputId, this.#depIds, true, provider);
    }
}

type DependenciesToIds<Dependencies extends readonly unknown[]> = {
    [Index in keyof Dependencies]: HaywireId<
        StripAnnotations<Dependencies[Index]>,
        GenericClass<StripAnnotations<Dependencies[Index]>> | null,
        string | symbol | null,
        null extends StripAnnotations<Dependencies[Index], 'latebinding' | 'supplier'>
            ? boolean
            : false,
        undefined extends StripAnnotations<Dependencies[Index], 'latebinding' | 'supplier'>
            ? boolean
            : false,
        StripAnnotations<Dependencies[Index], 'latebinding'> extends Supplier<unknown>
            ? true
            : false,
        Dependencies[Index] extends LateBinding<unknown> ? true : false
    >;
};

type DependenciesMisMatch<
    DependencyIds extends readonly (GenericHaywireId | IsClass)[],
    Dependencies extends readonly unknown[],
> = IdOrClassToIds<DependencyIds> extends DependenciesToIds<Dependencies>
    ? []
    : [InvalidInput<'DependenciesMismatch'>];

/**
 * Binding builder that has output + provider, and needs the dependencies.
 *
 * Note that despite the fact that _typescript_ knows the dependency types, _javascript_ does not.
 * So it is always necessary to provide the dependency ids or classes, in the order they will be passed to the provider.
 */
export class ProviderBindingBuilder<
    OutputId extends GenericOutputHaywireId,
    Dependencies extends readonly unknown[],
> {
    readonly #outputId: OutputId;
    readonly #provider: (...deps: [...Dependencies]) => HaywireIdType<OutputId>;

    public constructor(
        outputId: OutputId,
        provider: (...deps: [...Dependencies]) => HaywireIdType<OutputId>
    ) {
        this.#outputId = outputId;
        this.#provider = provider;
    }

    public withDependencies<DependencyIds extends readonly (GenericHaywireId | IsClass)[]>(
        depIds: [...DependencyIds],
        ...invalidInput: DependenciesMisMatch<DependencyIds, Dependencies> & []
    ): Binding<OutputId, IdOrClassToIds<DependencyIds>, false>;
    public withDependencies<DependencyIds extends readonly (GenericHaywireId | IsClass)[]>(
        depIds: [...DependencyIds]
    ): Binding<OutputId, IdOrClassToIds<DependencyIds>, false> {
        return new Binding(
            this.#outputId,
            idOrClassToIds(depIds),
            false,
            this.#provider as (
                ...args: DependencyIdTypes<IdOrClassToIds<DependencyIds>>
            ) => HaywireIdType<OutputId>
        );
    }
}

/**
 * Binding builder that has output + async provider, and needs the dependencies.
 *
 * Note that despite the fact that _typescript_ knows the dependency types, _javascript_ does not.
 * So it is always necessary to provide the dependency ids or classes, in the order they will be passed to the provider.
 */
export class AsyncProviderBindingBuilder<
    OutputId extends GenericOutputHaywireId,
    Dependencies extends readonly unknown[],
> {
    readonly #outputId: OutputId;
    readonly #provider: (
        ...deps: [...Dependencies]
    ) => HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>;

    public constructor(
        outputId: OutputId,
        provider: (
            ...deps: [...Dependencies]
        ) => HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>
    ) {
        this.#outputId = outputId;
        this.#provider = provider;
    }

    public withDependencies<DependencyIds extends readonly (GenericHaywireId | IsClass)[]>(
        depIds: [...DependencyIds],
        ...invalidInput: DependenciesMisMatch<DependencyIds, Dependencies> & []
    ): Binding<OutputId, IdOrClassToIds<DependencyIds>, true>;
    public withDependencies<DependencyIds extends readonly (GenericHaywireId | IsClass)[]>(
        depIds: [...DependencyIds]
    ): Binding<OutputId, IdOrClassToIds<DependencyIds>, true> {
        return new Binding(
            this.#outputId,
            idOrClassToIds(depIds),
            true,
            this.#provider as (
                ...args: DependencyIdTypes<IdOrClassToIds<DependencyIds>>
            ) => Promise<HaywireIdType<OutputId>>
        );
    }
}

type MissingConstructorInput = [InvalidInput<'MissingConstructorInput'>];
type MissingConstructorType<T extends GenericHaywireId> = null extends HaywireIdConstructor<T>
    ? MissingConstructorInput
    : [];

/**
 * Binding builder that only has the output id.
 *
 * Contains helper methods to chain the dependency ids and providers with strong typing.
 * Can optionally omit dependency ids and providers in special cases such as no dependencies
 * or using the constructor as the provider.
 */
export class BindingBuilder<OutputId extends GenericOutputHaywireId> {
    readonly #outputId: OutputId;

    public constructor(outputId: OutputId) {
        this.#outputId = outputId;
    }

    public withInstance(value: HaywireIdType<OutputId>): Binding<OutputId, [], false> {
        return new Binding(this.#outputId, [], false, () => value, optimisticSingletonScope);
    }

    public withConstructorGenerator(
        ...invalidInput: ExtendsType<
            HaywireIdConstructor<OutputId>,
            DepsClass<HaywireIdType<OutputId>, []>
        >
    ): Binding<OutputId, [], false>;
    public withConstructorGenerator(): GenericBinding {
        return new Binding(
            this.#outputId,
            [],
            false,
            () => new (this.#outputId.construct as DepsClass<HaywireIdType<OutputId>, []>)()
        );
    }

    public withGenerator(provider: () => HaywireIdType<OutputId>): Binding<OutputId, [], false> {
        return new Binding(this.#outputId, [], false, provider);
    }

    public withAsyncGenerator(
        provider: () => HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>,
        ...invalidInput: AsyncPromiseOutput<OutputId> & []
    ): Binding<OutputId, [], true>;
    public withAsyncGenerator(
        provider: () => HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>
    ): Binding<OutputId, [], true> {
        return new Binding(this.#outputId, [], true, provider);
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
            this.#outputId,
            (...args) =>
                new (this.#outputId.construct as DepsClass<HaywireIdType<OutputId>, unknown[]>)(
                    ...args
                )
        );
    }

    public withProvider<Dependencies extends readonly unknown[]>(
        provider: (...deps: [...Dependencies]) => HaywireIdType<OutputId>
    ): ProviderBindingBuilder<OutputId, Dependencies> {
        return new ProviderBindingBuilder(this.#outputId, provider);
    }

    public withAsyncProvider<Dependencies extends readonly unknown[]>(
        provider: (
            ...deps: [...Dependencies]
        ) => HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>,
        ...invalidInput: AsyncPromiseOutput<OutputId> & []
    ): AsyncProviderBindingBuilder<OutputId, Dependencies>;
    public withAsyncProvider<Dependencies extends readonly unknown[]>(
        provider: (
            ...deps: [...Dependencies]
        ) => HaywireIdType<OutputId> | Promise<HaywireIdType<OutputId>>
    ): AsyncProviderBindingBuilder<OutputId, Dependencies> {
        return new AsyncProviderBindingBuilder(this.#outputId, provider);
    }
}
