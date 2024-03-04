import {
    type ClassToConstructable,
    type GenericHaystackId,
    type GenericOutputHaystackId,
    type HaystackId,
    type HaystackIdConstructor,
    type HaystackIdType,
    type StripAnnotations,
    unsafeIdentifier,
} from '#identifier';
import { type Scopes, transientScope, optimisticSingletonScope } from '#scopes';
import type {
    GenericClass,
    DepsClass,
    ExtendsType,
    InvalidInput,
    IsClass,
    LateBinding,
    LiteralStringType,
    Supplier,
} from '#types';

export type DependencyIdTypes<
    Dependencies extends readonly [...GenericHaystackId[]],
> = {
    [Index in keyof Dependencies]: HaystackIdType<Dependencies[Index]>;
};
export type GenericBinding = Binding<GenericOutputHaystackId, any, boolean>;

export class Binding<
    OutputId extends GenericOutputHaystackId,
    Dependencies extends readonly [...GenericHaystackId[]],
    Async extends boolean = false,
> {
    public constructor(
        public readonly outputId: OutputId,
        public readonly depIds: readonly [...Dependencies],
        public readonly isAsync: Async,
        public readonly provider: (
            ...deps: DependencyIdTypes<Dependencies>
        ) => Async extends true
            ? Promise<HaystackIdType<OutputId>> | HaystackIdType<OutputId>
            : HaystackIdType<OutputId>,
        public readonly scope: Scopes = transientScope
    ) {}

    public get dependencyIds(): readonly GenericHaystackId[] {
        return this.depIds;
    }

    public scoped(scope: Scopes) {
        return new Binding(
            this.outputId,
            this.depIds,
            this.isAsync,
            this.provider,
            scope
        );
    }

    public named(
        name?: null
    ): Binding<
        this['outputId'] extends HaystackId<
            infer U,
            infer V,
            string | symbol | null,
            infer Nullable,
            infer Undefinable,
            false,
            false
        >
            ? HaystackId<U, V, null, Nullable, Undefinable, false, false>
            : never,
        Dependencies,
        Async
    >;
    public named<NewName extends string | symbol>(
        named: NewName,
        ...invalidInput: LiteralStringType<NewName>
    ): Binding<
        this['outputId'] extends HaystackId<
            infer U,
            infer V,
            string | symbol | null,
            infer Nullable,
            infer Undefinable,
            false,
            false
        >
            ? HaystackId<U, V, NewName, Nullable, Undefinable, false, false>
            : never,
        Dependencies,
        Async
    >;
    public named(named: string | symbol | null = null) {
        return new Binding(
            this.outputId.named(named as ''),
            this.depIds,
            this.isAsync,
            this.provider
        ) as Binding<
            this['outputId'] extends HaystackId<
                infer U,
                infer V,
                string | symbol | null,
                infer Nullable,
                infer Undefinable,
                false,
                false
            >
                ? HaystackId<
                      U,
                      V,
                      string | symbol | null,
                      Nullable,
                      Undefinable,
                      false,
                      false
                  >
                : never,
            Dependencies,
            Async
        >;
    }

    public nullable(
        val?: true
    ): Binding<
        this['outputId'] extends HaystackId<
            infer U,
            infer V,
            infer Named,
            boolean,
            infer Undefinable,
            false,
            false
        >
            ? HaystackId<U, V, Named, true, Undefinable, false, false>
            : never,
        Dependencies,
        Async
    >;
    public nullable() {
        return new Binding(
            this.outputId.nullable(),
            this.depIds,
            this.isAsync,
            this.provider
        );
    }

    public undefinable(
        val?: true
    ): Binding<
        this['outputId'] extends HaystackId<
            infer U,
            infer V,
            infer Named,
            infer Nullable,
            boolean,
            false,
            false
        >
            ? HaystackId<U, V, Named, Nullable, true, false, false>
            : never,
        Dependencies,
        Async
    >;
    public undefinable() {
        return new Binding(
            this.outputId.undefinable(),
            this.depIds,
            this.isAsync,
            this.provider
        );
    }
}

type IdOrClassToIds<
    Dependencies extends readonly (GenericHaystackId | IsClass)[],
> = {
    [Index in keyof Dependencies]: Dependencies[Index] extends IsClass
        ? ClassToConstructable<Dependencies[Index]>
        : Dependencies[Index] extends GenericHaystackId
          ? Dependencies[Index]
          : never;
};

type ExtendsPromise<T> = T extends Promise<unknown> ? true : false;
type AsyncPromiseOutput<OutputId extends GenericHaystackId> =
    true extends ExtendsPromise<HaystackIdType<OutputId>>
        ? [InvalidInput<'AsyncPromiseResponse'>]
        : [];

const idOrClassToIds = <
    Dependencies extends readonly (GenericHaystackId | IsClass)[],
>(
    ids: [...Dependencies]
): IdOrClassToIds<Dependencies> => {
    return ids.map(id =>
        unsafeIdentifier(id as GenericHaystackId)
    ) as IdOrClassToIds<Dependencies>;
};

export class DepsBindingBuilder<
    OutputId extends GenericOutputHaystackId,
    DependencyIds extends readonly [...GenericHaystackId[]],
> {
    #outputId: OutputId;
    #depIds: DependencyIds;
    constructor(outputId: OutputId, depIds: DependencyIds) {
        this.#outputId = outputId;
        this.#depIds = depIds;
    }

    public declare foo: DepsClass<
        HaystackIdType<OutputId>,
        DependencyIdTypes<DependencyIds>
    >;

    public withConstructorProvider(
        ...inputInput: ExtendsType<
            HaystackIdConstructor<OutputId>,
            DepsClass<
                HaystackIdType<OutputId>,
                DependencyIdTypes<DependencyIds>
            >
        >
    ): Binding<OutputId, DependencyIds>;
    public withConstructorProvider(): Binding<OutputId, DependencyIds, false> {
        return new Binding(
            this.#outputId,
            this.#depIds,
            false,
            (...deps: DependencyIdTypes<DependencyIds>) =>
                new (
                    this.#outputId.construct as DepsClass<
                        HaystackIdType<OutputId>,
                        DependencyIdTypes<DependencyIds>
                    >
                )(...deps)
        );
    }

    public withProvider(
        provider: (
            ...deps: DependencyIdTypes<DependencyIds>
        ) => HaystackIdType<OutputId>
    ): Binding<OutputId, DependencyIds, false> {
        return new Binding(this.#outputId, this.#depIds, false, provider);
    }

    public withAsyncProvider(
        provider: (
            ...deps: DependencyIdTypes<DependencyIds>
        ) => Promise<HaystackIdType<OutputId>> | HaystackIdType<OutputId>,
        ...invalidInput: AsyncPromiseOutput<OutputId>
    ): Binding<OutputId, DependencyIds, true>;
    public withAsyncProvider(
        ...[provider]: [
            (
                ...deps: DependencyIdTypes<DependencyIds>
            ) => Promise<HaystackIdType<OutputId>> | HaystackIdType<OutputId>,
            ...AsyncPromiseOutput<OutputId>,
        ]
    ): Binding<OutputId, DependencyIds, true> {
        return new Binding(this.#outputId, this.#depIds, true, provider);
    }
}

type DependenciesToIds<Dependencies extends readonly unknown[]> = {
    [Index in keyof Dependencies]: HaystackId<
        StripAnnotations<Dependencies[Index]>,
        GenericClass<StripAnnotations<Dependencies[Index]>> | null,
        string | symbol | null,
        null extends StripAnnotations<
            Dependencies[Index],
            'latebinding' | 'supplier'
        >
            ? boolean
            : false,
        undefined extends StripAnnotations<
            Dependencies[Index],
            'latebinding' | 'supplier'
        >
            ? boolean
            : false,
        StripAnnotations<
            Dependencies[Index],
            'latebinding'
        > extends Supplier<unknown>
            ? true
            : false,
        Dependencies[Index] extends LateBinding<unknown> ? true : false
    >;
};

type DependenciesMisMatch<
    DependencyIds extends readonly (GenericHaystackId | IsClass)[],
    Dependencies extends readonly unknown[],
> = IdOrClassToIds<DependencyIds> extends DependenciesToIds<Dependencies>
    ? []
    : [InvalidInput<'DependenciesMismatch'>];

export class ProviderBindingBuilder<
    OutputId extends GenericOutputHaystackId,
    Dependencies extends readonly unknown[],
> {
    #outputId: OutputId;
    #provider: (...deps: [...Dependencies]) => HaystackIdType<OutputId>;
    public constructor(
        outputId: OutputId,
        provider: (...deps: [...Dependencies]) => HaystackIdType<OutputId>
    ) {
        this.#outputId = outputId;
        this.#provider = provider;
    }

    public withDependencies<
        DependencyIds extends readonly (GenericHaystackId | IsClass)[],
    >(
        ...[depIds]: [
            [...DependencyIds],
            ...invalidInput: DependenciesMisMatch<DependencyIds, Dependencies>,
        ]
    ): Binding<OutputId, IdOrClassToIds<DependencyIds>, false> {
        return new Binding(
            this.#outputId,
            idOrClassToIds(depIds),
            false,
            this.#provider as (
                ...args: DependencyIdTypes<IdOrClassToIds<DependencyIds>>
            ) => HaystackIdType<OutputId>
        );
    }
}

export class AsyncProviderBindingBuilder<
    OutputId extends GenericOutputHaystackId,
    Dependencies extends readonly unknown[],
> {
    #outputId: OutputId;
    #provider: (
        ...deps: [...Dependencies]
    ) => HaystackIdType<OutputId> | Promise<HaystackIdType<OutputId>>;
    public constructor(
        outputId: OutputId,
        provider: (
            ...deps: [...Dependencies]
        ) => HaystackIdType<OutputId> | Promise<HaystackIdType<OutputId>>
    ) {
        this.#outputId = outputId;
        this.#provider = provider;
    }

    public withDependencies<
        DependencyIds extends readonly (GenericHaystackId | IsClass)[],
    >(
        ...[depIds]: [
            [...DependencyIds],
            ...invalidInput: DependenciesMisMatch<DependencyIds, Dependencies>,
        ]
    ): Binding<OutputId, IdOrClassToIds<DependencyIds>, true> {
        return new Binding(
            this.#outputId,
            idOrClassToIds(depIds),
            true,
            this.#provider as (
                ...args: DependencyIdTypes<IdOrClassToIds<DependencyIds>>
            ) => Promise<HaystackIdType<OutputId>>
        );
    }
}

type MissingConstructorInput = [InvalidInput<'MissingConstructorInput'>];
type MissingConstructorType<T extends GenericHaystackId> =
    null extends HaystackIdConstructor<T> ? MissingConstructorInput : [];

export class BindingBuilder<OutputId extends GenericOutputHaystackId> {
    #outputId: OutputId;
    public constructor(outputId: OutputId) {
        this.#outputId = outputId;
    }

    public withInstance(
        value: HaystackIdType<OutputId>
    ): Binding<OutputId, [], false> {
        return new Binding(
            this.#outputId,
            [],
            false,
            () => value,
            optimisticSingletonScope
        );
    }

    public withConstructor(
        ...invalidInput: ExtendsType<
            HaystackIdConstructor<OutputId>,
            DepsClass<HaystackIdType<OutputId>, []>
        >
    ): Binding<OutputId, [], false>;
    public withConstructor() {
        return new Binding(
            this.#outputId,
            [],
            false,
            () =>
                new (
                    this.#outputId.construct as DepsClass<
                        HaystackIdType<OutputId>,
                        []
                    >
                )()
        );
    }

    public withGenerator(
        provider: () => HaystackIdType<OutputId>
    ): Binding<OutputId, [], false> {
        return new Binding(this.#outputId, [], false, provider);
    }

    public withAsyncGenerator(
        provider: () =>
            | HaystackIdType<OutputId>
            | Promise<HaystackIdType<OutputId>>,
        ...invalidInput: AsyncPromiseOutput<OutputId>
    ): Binding<OutputId, [], true>;
    public withAsyncGenerator(
        ...[provider]: [
            () => HaystackIdType<OutputId> | Promise<HaystackIdType<OutputId>>,
            ...AsyncPromiseOutput<OutputId>,
        ]
    ): Binding<OutputId, [], true> {
        return new Binding(this.#outputId, [], true, provider);
    }

    public withDependencies<
        Dependencies extends readonly (GenericHaystackId | IsClass)[],
    >(
        dependencyIds: [...Dependencies]
    ): DepsBindingBuilder<OutputId, IdOrClassToIds<Dependencies>> {
        return new DepsBindingBuilder(
            this.#outputId,
            idOrClassToIds(dependencyIds)
        );
    }

    public withConstructorProvider(
        ...invalidInput: MissingConstructorType<OutputId>
    ): ProviderBindingBuilder<
        OutputId,
        ConstructorParameters<NonNullable<HaystackIdConstructor<OutputId>>>
    >;
    public withConstructorProvider(): ProviderBindingBuilder<
        OutputId,
        ConstructorParameters<NonNullable<HaystackIdConstructor<OutputId>>>
    > {
        return new ProviderBindingBuilder(
            this.#outputId,
            (...args) =>
                new (
                    this.#outputId.construct as DepsClass<
                        HaystackIdType<OutputId>,
                        unknown[]
                    >
                )(...args)
        );
    }

    public withProvider<Dependencies extends readonly unknown[]>(
        provider: (...deps: [...Dependencies]) => HaystackIdType<OutputId>
    ): ProviderBindingBuilder<OutputId, Dependencies> {
        return new ProviderBindingBuilder(this.#outputId, provider);
    }

    public withAsyncProvider<Dependencies extends readonly unknown[]>(
        provider: (
            ...deps: [...Dependencies]
        ) => HaystackIdType<OutputId> | Promise<HaystackIdType<OutputId>>,
        ...invalidInput: AsyncPromiseOutput<OutputId>
    ): AsyncProviderBindingBuilder<OutputId, Dependencies>;
    public withAsyncProvider<Dependencies extends readonly unknown[]>(
        ...[provider]: [
            (
                ...deps: [...Dependencies]
            ) => HaystackIdType<OutputId> | Promise<HaystackIdType<OutputId>>,
            ...AsyncPromiseOutput<OutputId>,
        ]
    ): AsyncProviderBindingBuilder<OutputId, Dependencies> {
        return new AsyncProviderBindingBuilder(this.#outputId, provider);
    }
}
