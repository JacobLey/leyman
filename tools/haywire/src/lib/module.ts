import type { BindingOutputType, GenericBinding } from '#binding';
import {
    type AsyncContainer,
    type Container,
    createAsyncContainer,
    createSyncContainer,
} from '#container';
import { HaywireDuplicateOutputError } from '#errors';
import { type Factory, wireFactory } from '#factory';
import {
    expandOutputId,
    type GenericHaywireId,
    type GenericOutputHaywireId,
    type HaywireIdType,
    type OutputHaywireId,
    type StripAnnotations,
} from '#identifier';
import type { ExpandOutput, Extendable, InvalidInput, NonExtendable } from '#types';

type SimplifyDependencyType<T extends readonly GenericHaywireId[]> = {
    [Index in keyof T]: [
        NonExtendable<
            HaywireIdType<OutputHaywireId<T[Index]>>,
            T[Index]['construct'],
            T[Index]['annotations']['named']
        >,
    ];
}[number];

export type GenericModule = Module<any, any, boolean>;

type ModuleOutputs<T extends GenericModule> = T[typeof idType]['outputs'];
type ModuleDependencies<T extends GenericModule> = T[typeof idType]['dependencies'];

type BaseIds<OutputsOrDependencies extends [Extendable]> = OutputsOrDependencies extends [
    NonExtendable<infer T, infer Construct, infer Named>,
]
    ? [NonExtendable<StripAnnotations<T>, Construct, Named>]
    : never;

type FilterIdType<
    OutputsOrDependencies extends [Extendable],
    Predicate extends [Extendable],
> = Predicate extends [NonExtendable<infer T, infer Construct, infer Named>]
    ? Extract<OutputsOrDependencies, ExpandOutput<T, Construct, Named, false, false>>
    : never;

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
> = Exclude<
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
> = Exclude<
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
        BindingOutputType<Binding['outputId']>
    >,
    ...ValidateDependenciesSatisfiedByOutput<
        BindingOutputType<Binding['outputId']>,
        SimplifyDependencyType<Binding['depIds']>
    >,
];

/**
 * Type-based validations for `addBinding`. Will resolve to an impossible spreadable input if invalid.
 *
 * Enforces:
 * > The specified outputId does not already exist
 * > The module's dependencies are satisfied by the incoming outputId
 * > The module's outputs satisfies incoming dependencies
 *
 * @template Outputs - existing module outputs
 * @template Dependencies - existing module dependencies
 * @template Binding - incoming binding
 */
type ValidateAddBindingInput<
    Outputs extends [Extendable],
    Dependencies extends [Extendable],
    Binding extends GenericBinding,
> = [
    ...ValidateOutputIdDoesNotExist<Outputs, BindingOutputType<Binding['outputId']>>,
    ...ValidateOutputSatisfiesDependency<
        Dependencies | SimplifyDependencyType<Binding['depIds']>,
        BindingOutputType<Binding['outputId']>
    >,
    ...ValidateDependenciesSatisfiedByOutput<Outputs, SimplifyDependencyType<Binding['depIds']>>,
] &
    [];

type ValidateMergeModuleInput<
    ExistingModule extends GenericModule,
    IncomingModule extends GenericModule,
> = [
    ...ValidateOutputIdDoesNotExist<ModuleOutputs<ExistingModule>, ModuleOutputs<IncomingModule>>,
    ...ValidateOutputSatisfiesDependency<
        ModuleDependencies<ExistingModule>,
        ModuleOutputs<IncomingModule>
    >,
    ...ValidateDependenciesSatisfiedByOutput<
        ModuleOutputs<ExistingModule>,
        ModuleDependencies<IncomingModule>
    >,
] &
    [];

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
 *
 * Since it is incomplete, it cannot yet be used to generate a requested instance.
 * Once all necessary bindings are present, can use `createContainer` to perform final validations
 * and start generating instances.
 *
 * @template Outputs
 * @template Dependencies
 * @template Async
 */
export class Module<
    Outputs extends [Extendable],
    Dependencies extends [Extendable],
    Async extends boolean,
> {
    public declare [idType]: {
        outputs: Outputs;
        dependencies: Dependencies;
    };

    readonly #bindings: ReadonlyMap<GenericOutputHaywireId, GenericBinding>;
    public readonly isAsync: Async;

    private constructor(
        isAsync: Async,
        bindings: ReadonlyMap<GenericOutputHaywireId, GenericBinding>
    ) {
        this.isAsync = isAsync;
        this.#bindings = bindings;
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
    ): Module<BindingOutputType<T['outputId']>, SimplifyDependencyType<T['depIds']>, T['isAsync']>;
    public static fromBinding<T extends GenericBinding>(
        this: void,
        binding: T
    ): Module<BindingOutputType<T['outputId']>, SimplifyDependencyType<T['depIds']>, T['isAsync']> {
        const bindings = new Map<GenericOutputHaywireId, GenericBinding>();
        for (const expandedId of expandOutputId(binding.outputId)) {
            bindings.set(expandedId, binding);
        }
        return new Module(binding.isAsync, bindings);
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
        ...invalidInput: ValidateAddBindingInput<Outputs, Dependencies, T>
    ): Module<
        BindingOutputType<T['outputId']> | Outputs,
        Dependencies | SimplifyDependencyType<T['depIds']>,
        T['isAsync'] extends true ? true : Async
    >;
    public addBinding<T extends GenericBinding>(
        binding: T
    ): Module<
        BindingOutputType<T['outputId']> | Outputs,
        Dependencies | SimplifyDependencyType<T['depIds']>,
        T['isAsync'] extends true ? true : Async
    > {
        const bindings = new Map(this.#bindings);

        for (const expandedId of expandOutputId(binding.outputId)) {
            if (bindings.has(expandedId)) {
                throw new HaywireDuplicateOutputError([expandedId.baseId()]);
            }
            bindings.set(expandedId, binding);
        }

        return new Module(this.isAsync || binding.isAsync, bindings) as Module<
            BindingOutputType<T['outputId']> | Outputs,
            Dependencies | SimplifyDependencyType<T['depIds']>,
            T['isAsync'] extends true ? true : Async
        >;
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
    public mergeModule<T extends GenericModule>(
        mod: T,
        ...invalidInput: ValidateMergeModuleInput<this, T>
    ): Module<
        ModuleOutputs<T> | Outputs,
        Dependencies | ModuleDependencies<T>,
        T['isAsync'] extends true ? true : Async
    >;
    public mergeModule<T extends GenericModule>(
        mod: T
    ): Module<
        ModuleOutputs<T> | Outputs,
        Dependencies | ModuleDependencies<T>,
        T['isAsync'] extends true ? true : Async
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

        return new Module(
            this.isAsync || mod.isAsync,
            new Map([...this.#bindings, ...mod.#bindings])
        ) as Module<
            ModuleOutputs<T> | Outputs,
            Dependencies | ModuleDependencies<T>,
            T['isAsync'] extends true ? true : Async
        >;
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
        ...invalidInput: ValidateToContainer<Outputs, Dependencies>
    ): Container<Outputs, Async>;
    public toContainer(): AsyncContainer<Outputs> {
        return this.isAsync
            ? createAsyncContainer(this.#bindings)
            : createSyncContainer(this.#bindings);
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
            T[typeof idType]['outputs'],
            T[typeof idType]['dependencies']
        >
    ): Container<T[typeof idType]['outputs'], T['isAsync']>;
    public static createContainer<T extends GenericModule>(
        this: void,
        mod: T
    ): AsyncContainer<T[typeof idType]['outputs']> {
        return mod.toContainer();
    }

    public toFactory(): Factory<Outputs, Exclude<Dependencies, Outputs>, Async, never> {
        return wireFactory(this.#bindings, this.isAsync);
    }

    public static createFactory<
        Outputs extends [Extendable],
        Dependencies extends [Extendable],
        Async extends boolean,
    >(
        this: void,
        mod: Module<Outputs, Dependencies, Async>
    ): Factory<Outputs, Exclude<Dependencies, Outputs>, Async, never> {
        return mod.toFactory();
    }
}

export const createModule = Module.fromBinding;
export const { createContainer, createFactory } = Module;
