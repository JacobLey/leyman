import type { BindingListOutputType, BindingOutputType, GenericBinding } from '#binding';
import type { AsyncContainer, Container } from '#container';
import type { Factory } from '#factory';
import type {
    GenericBaseHaywireId,
    GenericHaywireId,
    GenericOutputHaywireId,
    RawType,
} from '#identifier';
import type { ExpandOutput, Extendable, InvalidInput, NonExtendable } from '#types';
import { createAsyncContainer, createSyncContainer } from '#container';
import { HaywireDuplicateOutputError } from '#errors';
import { wireFactory } from '#factory';

type SimplifyDependencyType<T extends readonly GenericOutputHaywireId[]> = {
    [Index in keyof T]: [
        NonExtendable<
            RawType<T[Index]>,
            T[Index]['construct'],
            T[Index]['annotations']['named'],
            // Dependencies may be declared as 'multi', but are always resolved as a regular list
            T[Index]['annotations']['list'] extends 'multi' | true ? true : false,
            T[Index]['annotations']['nullable'],
            T[Index]['annotations']['undefinable']
        >,
    ];
}[number];

export type GenericModule = Module<any, any, any, boolean>;

type ModuleOutputs<T extends GenericModule> = T[typeof idType]['outputs'];
type ModuleListOutputs<T extends GenericModule> = T[typeof idType]['listOutputs'];
type ModuleDependencies<T extends GenericModule> = T[typeof idType]['dependencies'];

type BaseIds<OutputsOrDependencies extends [Extendable]> = OutputsOrDependencies extends [
    NonExtendable<infer T, infer Construct, infer Named, infer List, any, any>,
]
    ? [NonExtendable<T, Construct, Named, List, false, false>]
    : never;

/**
 * Returns the input from OutputsOrDependencies that share any of the same "base ids" as the Predicate.
 *
 * @template OutputsOrDependencies
 * @template Predicate
 */
type FilterIdType<
    OutputsOrDependencies extends [Extendable],
    Predicate extends [Extendable],
> = Predicate extends [NonExtendable<infer T, infer Construct, infer Named, infer List, any, any>]
    ? Extract<OutputsOrDependencies, ExpandOutput<T, Construct, Named, List, false, false>>
    : never;

/**
 * Bindings for a given output id.
 * Key is just base id, actual outputs may have more specific (e.g. nullable) restrictions on each.
 */
type Bindings = ReadonlyMap<GenericBaseHaywireId, GenericBinding>;
/**
 * List of all bindings for a shared output id.
 * Key is just base id, bindings may have more specific (e.g. nullable) restrictions on each.
 */
type ListBindings = ReadonlyMap<GenericBaseHaywireId, readonly GenericBinding[]>;

/**
 * An "inverse" of FilterIdType.
 *
 * Returns values from X who have base ids that are not at all present in Y.
 *
 * @template OutputsX
 * @template OutputsY
 */
type TakeXThatAreNotInY<OutputsX extends [Extendable], OutputsY extends [Extendable]> = Exclude<
    OutputsX,
    FilterIdType<OutputsX, BaseIds<OutputsY>>
>;

/**
 * Combine the output of two lists.
 *
 * Because list outputs are intentionally not unique, we need to handle the case where
 * one set returns nullable, and another set returns undefinable. So the result will be nullable AND undefinable.
 *
 * For values that are only defined in one list or the other, everything is let through.
 *
 * @template ExistingOutputs
 * @template IncomingOutputs
 */
export type CombineListOutputs<
    ExistingOutputs extends [Extendable],
    IncomingOutputs extends [Extendable],
> =
    | TakeXThatAreNotInY<ExistingOutputs, IncomingOutputs>
    | TakeXThatAreNotInY<IncomingOutputs, ExistingOutputs>
    | (ExistingOutputs & IncomingOutputs);

/**
 * Validate that the output of existing resource does not have any overlap with incoming binding's output.
 * Compare that Extract is an empty set (never).
 *
 * @template ExistingOutputs - outputs already on resource
 * @template IncomingOutputs - outputs on the incoming resource
 */
export type ValidateOutputIdDoesNotExist<
    ExistingOutputs extends [Extendable],
    IncomingOutputs extends [Extendable],
> = Extract<ExistingOutputs, IncomingOutputs> extends never ? [] : [InvalidInput<'BindingExists'>];

/**
 * Validate that incoming binding is capable of satisfying all existing dependencies.
 *
 * Filter the dependencies of the resource by those that share a common "base id" with the binding's output id.
 * If those remaining values are all a subset of the incoming outputId, it is acceptable.
 *
 * @template ExistingDependencies - existing resource dependencies
 * @template IncomingOutputs - outputs on the incoming resource
 */
export type ValidateOutputSatisfiesDependency<
    ExistingDependencies extends [Extendable],
    IncomingOutputs extends [Extendable],
> =
    Exclude<
        FilterIdType<ExistingDependencies, BaseIds<IncomingOutputs>>,
        IncomingOutputs
    > extends never
        ? []
        : [InvalidInput<'OutputDoesNotSatisfyDependency'>];

/**
 * Validate that dependencies of incoming binding are satisfied by existing output ids.
 *
 * Filter the bindings dependencies by those that share a common "base id" with resource's outputs.
 *
 * If the outputs of the resource are all a superset of these dependencies, it is acceptable.
 *
 * @template ExistingOutputs - outputs on existing resource
 * @template IncomingDependencies - dependencies on the incoming resource
 */
export type ValidateDependenciesSatisfiedByOutput<
    ExistingOutputs extends [Extendable],
    IncomingDependencies extends [Extendable],
> =
    Exclude<
        FilterIdType<IncomingDependencies, BaseIds<ExistingOutputs>>,
        ExistingOutputs
    > extends never
        ? []
        : [InvalidInput<'DependenciesNotSatisfiedByOutput'>];

/**
 * Type-based validations for `fromBinding`. Will resolve to an impossible spreadable input if invalid.
 *
 * Enforces:
 * > The module's dependencies are satisfied by the incoming outputId
 * > The module's outputs satisfies incoming dependencies
 *
 * @template Binding incoming binding
 */
type ValidateFromBindingInput<Binding extends GenericBinding> = [
    ...ValidateOutputSatisfiesDependency<
        SimplifyDependencyType<Binding['depIds']>,
        BindingListOutputType<Binding['outputId']> | BindingOutputType<Binding['outputId']>
    >,
    ...ValidateDependenciesSatisfiedByOutput<
        BindingListOutputType<Binding['outputId']> | BindingOutputType<Binding['outputId']>,
        SimplifyDependencyType<Binding['depIds']>
    >,
];

/**
 * Type-based validations for `addBinding`. Will resolve to an impossible spreadable input if invalid.
 *
 * Enforces:
 * > The specified outputId does not already exist (skipped for list)
 * > The module's dependencies are satisfied by the incoming outputId
 * > The module's outputs satisfies incoming dependencies
 *
 * @template Outputs - existing module outputs
 * @template ListOutputs - existing module list outputs
 * @template Dependencies - existing module dependencies
 * @template Binding - incoming binding
 */
type ValidateAddBindingInput<
    Outputs extends [Extendable],
    ListOutputs extends [Extendable],
    Dependencies extends [Extendable],
    Binding extends GenericBinding,
> = [
    ...ValidateOutputIdDoesNotExist<Outputs, BindingOutputType<Binding['outputId']>>,
    ...ValidateOutputSatisfiesDependency<
        Dependencies | SimplifyDependencyType<Binding['depIds']>,
        BindingListOutputType<Binding['outputId']> | BindingOutputType<Binding['outputId']>
    >,
    ...ValidateDependenciesSatisfiedByOutput<
        ListOutputs | Outputs,
        SimplifyDependencyType<Binding['depIds']>
    >,
] &
    [];

type ValidateMergeModuleInput<
    ExistingModule extends GenericModule,
    IncomingModule extends GenericModule,
> = [
    ...ValidateOutputIdDoesNotExist<ModuleOutputs<ExistingModule>, ModuleOutputs<IncomingModule>>,
    ...ValidateOutputSatisfiesDependency<
        ModuleDependencies<ExistingModule>,
        ModuleListOutputs<IncomingModule> | ModuleOutputs<IncomingModule>
    >,
    ...ValidateDependenciesSatisfiedByOutput<
        ModuleListOutputs<ExistingModule> | ModuleOutputs<ExistingModule>,
        ModuleDependencies<IncomingModule>
    >,
] &
    [];

/**
 * List dependencies of a module.
 * Retained by factories (even when satisfied) so registered list elements can be validated against them.
 *
 * @template Dependencies
 */
type ListDependencies<Dependencies extends [Extendable]> = Extract<
    Dependencies,
    [NonExtendable<any, any, any, true, any, any>]
>;

type ValidateToContainer<Outputs extends [Extendable], Dependencies extends [Extendable]> = [
    Dependencies,
] extends [Outputs]
    ? []
    : [InvalidInput<'MissingOutput'>];

declare const idType: unique symbol;
/**
 * A incomplete collection of unique bindings.
 *
 * Modules themselves are immutable, but may be merged with other modules or bindings to create a new `Module` with a larger collection.
 *
 * If any duplicate providers (generating the same `outputId`) are found in the module, an error will be thrown.
 * This is also protected against via type-checks.
 * The exception is lists, which may provide multiple implementations.
 *
 * Since it is incomplete, it cannot yet be used to generate a requested instance.
 * Once all necessary bindings are present, can use `createContainer` to perform final validations
 * and start generating instances.
 *
 * @template Outputs
 * @template ListOutputs
 * @template Dependencies
 * @template Async
 */
export class Module<
    Outputs extends [Extendable],
    ListOutputs extends [Extendable],
    Dependencies extends [Extendable],
    Async extends boolean,
> implements GenericModule
{
    public declare [idType]: {
        outputs: Outputs;
        listOutputs: ListOutputs;
        dependencies: Dependencies;
    };

    /**
     * Binding keyed by all viable output ids (same non-null binding will be keyed by both nullable + non-null).
     */
    readonly #bindings: Bindings;
    /**
     * All bindings of shared list output under the "baseId".
     */
    readonly #listBindings: ListBindings;
    public readonly isAsync: Async;

    private constructor(isAsync: Async, bindings: Bindings, listBindings: ListBindings) {
        this.isAsync = isAsync;
        this.#bindings = bindings;
        this.#listBindings = listBindings;
    }

    /**
     * Creates a module instance from a binding. This module only contains the single binding, but may be combined with
     * more bindings and modules to create a usable set.
     *
     * @param binding - binding to covert to module
     * @returns module containing only the single binding
     */
    public static fromBinding<T extends GenericBinding>(
        this: void,
        ...[binding]: [T, ...ValidateFromBindingInput<T>]
    ): Module<
        BindingOutputType<T['outputId']>,
        BindingListOutputType<T['outputId']>,
        SimplifyDependencyType<T['depIds']>,
        T['isAsync']
    >;
    public static fromBinding<T extends GenericBinding>(
        this: void,
        binding: T
    ): Module<
        BindingOutputType<T['outputId']>,
        BindingListOutputType<T['outputId']>,
        SimplifyDependencyType<T['depIds']>,
        T['isAsync']
    > {
        const bindings = new Map<GenericBaseHaywireId, GenericBinding>();
        const listBindings = new Map<GenericBaseHaywireId, GenericBinding[]>();
        const id = binding.outputId;
        if (id.annotations.list) {
            listBindings.set(id.baseId(), [binding]);
        } else {
            bindings.set(id.baseId(), binding);
        }
        return new Module(binding.isAsync, bindings, listBindings);
    }

    /**
     * Attach binding to collection.
     *
     * Creates a new module, rather mutating the existing module.
     *
     * Will produce an impossible input signature if:
     * > The specified outputId already exists
     * > A dependency exists on a more strict version of incoming output
     * > An existing output is laxer than the incoming dependency
     *
     * @param binding - binding instance to attach to module, must be have a unique output id
     * @returns module with new binding attached
     * @throws when binding's output id is not unique. Enforced by type safety as well.
     */
    public addBinding<T extends GenericBinding>(
        binding: T,
        ...invalidInput: ValidateAddBindingInput<Outputs, ListOutputs, Dependencies, T>
    ): Module<
        BindingOutputType<T['outputId']> | Outputs,
        CombineListOutputs<ListOutputs, BindingListOutputType<T['outputId']>>,
        Dependencies | SimplifyDependencyType<T['depIds']>,
        T['isAsync'] extends true ? true : Async
    >;
    public addBinding<T extends GenericBinding>(
        binding: T
    ): Module<
        BindingOutputType<T['outputId']> | Outputs,
        CombineListOutputs<ListOutputs, BindingListOutputType<T['outputId']>>,
        Dependencies | SimplifyDependencyType<T['depIds']>,
        T['isAsync'] extends true ? true : Async
    > {
        const bindings = new Map(this.#bindings);
        const listBindings = new Map(this.#listBindings);

        const id = binding.outputId;
        const key = id.baseId();
        if (id.annotations.list) {
            const existing = listBindings.get(key) ?? [];
            // The exact same binding instance is only included once
            if (!existing.includes(binding)) {
                listBindings.set(key, [...existing, binding]);
            }
        } else {
            if (bindings.has(key)) {
                throw new HaywireDuplicateOutputError([key]);
            }
            bindings.set(key, binding);
        }

        return new Module(
            (this.isAsync || binding.isAsync) as T['isAsync'] extends true ? true : Async,
            bindings,
            listBindings
        );
    }

    /**
     * Merge another module into this.
     * Will both result in failing types and throw an error if the bindings contained in the modules have an overlap
     * (e.g. they both declare a provider of `Foo`).
     *
     * Returns a new module with both sets of bindings, rather than mutating the existing modules.
     *
     * @param mod - module to merge into this one
     * @param invalidInput - typescript-only input that enforces valid types
     * @returns module with both sets of bindings
     */
    public mergeModule<
        Outputs2 extends [Extendable],
        ListOutputs2 extends [Extendable],
        Dependencies2 extends [Extendable],
        Async2 extends boolean,
    >(
        mod: Module<Outputs2, ListOutputs2, Dependencies2, Async2>,
        ...invalidInput: ValidateMergeModuleInput<
            this,
            Module<Outputs2, ListOutputs2, Dependencies2, Async2>
        >
    ): Module<
        Outputs | Outputs2,
        CombineListOutputs<ListOutputs, ListOutputs2>,
        Dependencies | Dependencies2,
        Async2 extends true ? true : Async
    >;
    public mergeModule<
        Outputs2 extends [Extendable],
        ListOutputs2 extends [Extendable],
        Dependencies2 extends [Extendable],
        Async2 extends boolean,
    >(
        mod: Module<Outputs2, ListOutputs2, Dependencies2, Async2>
    ): Module<
        Outputs | Outputs2,
        CombineListOutputs<ListOutputs, ListOutputs2>,
        Dependencies | Dependencies2,
        Async2 extends true ? true : Async
    > {
        const duplicateOutputIds = new Set<GenericHaywireId>();
        for (const outputId of mod.#bindings.keys()) {
            if (this.#bindings.has(outputId)) {
                duplicateOutputIds.add(outputId.baseId());
            }
        }

        if (duplicateOutputIds.size > 0) {
            throw new HaywireDuplicateOutputError([...duplicateOutputIds]);
        }

        const listBindings = new Map(this.#listBindings);
        for (const [key, otherListBindings] of mod.#listBindings) {
            const existing = listBindings.get(key) ?? [];
            // The exact same binding instance is only included once
            listBindings.set(key, [...new Set([...existing, ...otherListBindings])]);
        }

        return new Module(
            (this.isAsync || mod.isAsync) as Async2 extends true ? true : Async,
            new Map([...this.#bindings, ...mod.#bindings]),
            listBindings
        );
    }

    /**
     * Create a container from the provided module.
     *
     * If all bindings in the module are synchronous, the resulting container will be sync-enabled.
     * Otherwise the container will be async and require async usage for external calls to container.
     *
     * Type checking enforces that that the current module setup declares an output for every dependency.
     */
    public toContainer(
        ...invalidInput: [any] extends [Outputs]
            ? []
            : ValidateToContainer<ListOutputs | Outputs, Dependencies>
    ): Container<ListOutputs | Outputs, Async>;
    public toContainer(): AsyncContainer<ListOutputs | Outputs> {
        const bindings = new Map(this.#bindings);

        return this.isAsync
            ? createAsyncContainer(bindings, this.#listBindings)
            : createSyncContainer(bindings, this.#listBindings);
    }

    /**
     * Create a container from the provided module.
     *
     * If all bindings in the module are synchronous, the resulting container will be sync-enabled.
     * Otherwise the container will be async and require async usage for external calls to container.
     *
     * Type checking enforces that that the current module setup declares an output for every dependency.
     */
    public static createContainer<T extends GenericModule>(
        this: void,
        mod: T,
        ...invalidInput: ValidateToContainer<
            T[typeof idType]['listOutputs'] | T[typeof idType]['outputs'],
            T[typeof idType]['dependencies']
        >
    ): Container<T[typeof idType]['listOutputs'] | T[typeof idType]['outputs'], T['isAsync']>;
    public static createContainer<T extends GenericModule>(
        this: void,
        mod: T
    ): AsyncContainer<T[typeof idType]['listOutputs'] | T[typeof idType]['outputs']> {
        return mod.toContainer();
    }

    public toFactory(): Factory<
        ListOutputs | Outputs,
        Exclude<Dependencies, ListOutputs | Outputs> | ListDependencies<Dependencies>,
        Async,
        never
    > {
        return wireFactory(this.#bindings, this.#listBindings, this.isAsync);
    }

    public static createFactory<
        Outputs extends [Extendable],
        ListOutputs extends [Extendable],
        Dependencies extends [Extendable],
        Async extends boolean,
    >(
        this: void,
        mod: Module<Outputs, ListOutputs, Dependencies, Async>
    ): Factory<
        ListOutputs | Outputs,
        Exclude<Dependencies, ListOutputs | Outputs> | ListDependencies<Dependencies>,
        Async,
        never
    > {
        return mod.toFactory();
    }
}

export const createModule = Module.fromBinding;
export const { createContainer, createFactory } = Module;
