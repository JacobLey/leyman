import type { GenericBinding } from '#binding';
import {
    type AsyncContainer,
    createAsyncContainer,
    createSyncContainer,
    type SyncContainer,
} from '#container';
import { HaystackDuplicateOutputError } from '#errors';
import type {
    GenericHaystackId,
    HaystackId,
    HaystackIdType,
    StripAnnotations,
} from '#identifier';
import type { Extendable, InvalidInput, NonExtendable } from '#types';

type ExpandOutputUndefinable<
    T,
    Named extends string | symbol | null,
    Undefinable extends boolean,
> = true extends Undefinable
    ? [NonExtendable<T | undefined, Named>]
    : [NonExtendable<T | undefined, Named>] | [NonExtendable<T, Named>];
type ExpandOutputNullable<
    T,
    Named extends string | symbol | null,
    Nullable extends boolean,
    Undefinable extends boolean,
> = true extends Nullable
    ? ExpandOutputUndefinable<T | null, Named, Undefinable>
    :
          | ExpandOutputUndefinable<T | null, Named, Undefinable>
          | ExpandOutputUndefinable<T, Named, Undefinable>;
type BindingOutputType<T extends GenericHaystackId> = T extends HaystackId<
    infer BaseType,
    any,
    infer Named,
    infer Nullable,
    infer Undefinable,
    'async' | boolean,
    boolean
>
    ? ExpandOutputNullable<BaseType, Named, Nullable, Undefinable>
    : never;

type SimplifyDependencyType<T extends readonly GenericHaystackId[]> = {
    [Index in keyof T]: [
        NonExtendable<
            StripAnnotations<
                HaystackIdType<T[Index]>,
                'latebinding' | 'supplier'
            >,
            T[Index]['annotations']['named']
        >,
    ];
}[number];

export type GenericModule = Module<[Extendable], [Extendable], boolean>;

type ModuleOutputs<T extends GenericModule> = T extends Module<
    infer O,
    [Extendable],
    boolean
>
    ? O
    : never;
type ModuleDependencies<T extends GenericModule> = T extends Module<
    [Extendable],
    infer D,
    boolean
>
    ? D
    : never;

const expandOutputId = (id: GenericHaystackId): Set<GenericHaystackId> => {
    const expandedIds = new Set<GenericHaystackId>();

    for (const nullable of [false, true]) {
        for (const undefinable of [false, true]) {
            let expandedId = id;
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

declare const typeTracking: unique symbol;
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
 */
export class Module<
    Outputs extends [Extendable],
    Dependencies extends [Extendable],
    Async extends boolean,
> {
    public declare [typeTracking]: {
        outputs: Outputs;
        dependencies: Dependencies;
    };

    readonly #bindings: ReadonlyMap<GenericHaystackId, GenericBinding>;
    public readonly isAsync: Async;

    private constructor(
        isAsync: Async,
        bindings: ReadonlyMap<GenericHaystackId, GenericBinding>
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
        binding: T
    ): Module<
        BindingOutputType<T['outputId']>,
        SimplifyDependencyType<T['depIds']>,
        T['isAsync']
    > {
        const bindings = new Map<GenericHaystackId, GenericBinding>();
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
     * @param binding - binding instance to attach to module, must be have a unique output id
     * @returns module with new binding attached
     * @throws when binding's output id is not unique. Enforced by type safety as well.
     */
    public addBinding<T extends GenericBinding>(
        binding: T,
        ...invalidInput: true extends (
            Outputs extends BindingOutputType<T['outputId']>
                ? true
                : false
        )
            ? [1]
            : []
    ): Module<
        BindingOutputType<T['outputId']> | Outputs,
        Dependencies | SimplifyDependencyType<T['depIds']>,
        T['isAsync'] extends true ? true : Async
    >;
    public addBinding<T extends GenericBinding>(
        ...[binding]: [
            T,
            ...(true extends (
                Outputs extends BindingOutputType<T['outputId']>
                    ? true
                    : false
            )
                ? [1]
                : []),
        ]
    ): Module<
        BindingOutputType<T['outputId']> | Outputs,
        Dependencies | SimplifyDependencyType<T['depIds']>,
        T['isAsync'] extends true ? true : Async
    > {
        const bindings = new Map(this.#bindings);

        for (const expandedId of expandOutputId(binding.outputId)) {
            if (bindings.has(expandedId)) {
                throw new HaystackDuplicateOutputError([expandedId.baseId()]);
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
        ...invalidInput: true extends (
            Outputs extends ModuleOutputs<T>
                ? true
                : false
        )
            ? [1]
            : []
    ): Module<
        ModuleOutputs<T> | Outputs,
        Dependencies | ModuleDependencies<T>,
        T['isAsync'] extends true ? true : Async
    >;
    public mergeModule<T extends GenericModule>(
        ...[mod]: [
            T,
            ...(true extends (Outputs extends ModuleOutputs<T> ? true : false)
                ? [1]
                : []),
        ]
    ): Module<
        ModuleOutputs<T> | Outputs,
        Dependencies | ModuleDependencies<T>,
        T['isAsync'] extends true ? true : Async
    > {
        const duplicateOutputIds = new Set<GenericHaystackId>();
        for (const outputId of mod.#bindings.keys()) {
            if (this.#bindings.has(outputId)) {
                duplicateOutputIds.add(outputId.baseId());
            }
        }

        if (duplicateOutputIds.size > 0) {
            throw new HaystackDuplicateOutputError([...duplicateOutputIds]); // [...depdupeEffectiveBaseId(duplicateOutputIds)]);
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
    public static createContainer<
        T extends Module<[Extendable], [Extendable], true>,
    >(
        this: void,
        mod: T,
        ...invalidInput: [ModuleDependencies<T>] extends [ModuleOutputs<T>]
            ? []
            : [InvalidInput<'MissingOutput'>]
    ): AsyncContainer<T[typeof typeTracking]['outputs']>;
    public static createContainer<
        T extends Module<[Extendable], [Extendable], false>,
    >(
        this: void,
        mod: T,
        ...invalidInput: [ModuleDependencies<T>] extends [ModuleOutputs<T>]
            ? []
            : [InvalidInput<'MissingOutput'>]
    ): SyncContainer<T[typeof typeTracking]['outputs']>;
    public static createContainer<T extends GenericModule>(
        this: void,
        mod: T
    ): AsyncContainer<T[typeof typeTracking]['outputs']> {
        return mod.isAsync
            ? createAsyncContainer(mod.#bindings)
            : createSyncContainer(mod.#bindings);
    }
}

export const createModule = Module.fromBinding;
export const { createContainer } = Module;
