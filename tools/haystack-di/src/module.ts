import type { GenericBinding } from '#binding';
import {
    AsyncContainer,
    createAsyncContainer,
    createSyncContainer,
    SyncContainer,
} from '#container';
import {
    type GenericHaystackId,
    type HaystackId,
    type HaystackIdType,
    type StripAnnotations,
} from '#identifier';
import type { Extendable, InvalidInput, NonExtendable } from '#types';
import { HaystackDuplicateOutputError } from '#errors';

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
    boolean | 'async',
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
export class Module<
    Outputs extends [Extendable],
    Dependencies extends [Extendable],
    Async extends boolean,
> {
    public declare [typeTracking]: {
        outputs: Outputs;
        dependencies: Dependencies;
    };

    #bindings: ReadonlyMap<GenericHaystackId, GenericBinding>;
    private constructor(
        public readonly isAsync: Async,
        bindings: ReadonlyMap<GenericHaystackId, GenericBinding>
    ) {
        this.#bindings = bindings;
    }

    public static fromBinding<T extends GenericBinding>(
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
        Outputs | BindingOutputType<T['outputId']>,
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
        Outputs | BindingOutputType<T['outputId']>,
        Dependencies | SimplifyDependencyType<T['depIds']>,
        T['isAsync'] extends true ? true : Async
    > {
        const bindings = new Map([...this.#bindings]);

        for (const expandedId of expandOutputId(binding.outputId)) {
            if (bindings.has(expandedId)) {
                throw new HaystackDuplicateOutputError([expandedId.baseId()]);
            }
            bindings.set(expandedId, binding);
        }

        return new Module(this.isAsync || binding.isAsync, bindings) as Module<
            Outputs | BindingOutputType<T['outputId']>,
            Dependencies | SimplifyDependencyType<T['depIds']>,
            T['isAsync'] extends true ? true : Async
        >;
    }

    public mergeModule<T extends GenericModule>(
        module: T,
        ...invalidInput: true extends (
            Outputs extends ModuleOutputs<T>
                ? true
                : false
        )
            ? [1]
            : []
    ): Module<
        Outputs | ModuleOutputs<T>,
        Dependencies | ModuleDependencies<T>,
        T['isAsync'] extends true ? true : Async
    >;
    public mergeModule<T extends GenericModule>(
        ...[module]: [
            T,
            ...(true extends (Outputs extends ModuleOutputs<T> ? true : false)
                ? [1]
                : []),
        ]
    ): Module<
        Outputs | ModuleOutputs<T>,
        Dependencies | ModuleDependencies<T>,
        T['isAsync'] extends true ? true : Async
    > {
        const duplicateOutputIds = new Set<GenericHaystackId>();
        for (const outputId of module.#bindings.keys()) {
            if (this.#bindings.has(outputId)) {
                duplicateOutputIds.add(outputId.baseId());
            }
        }

        if (duplicateOutputIds.size > 0) {
            throw new HaystackDuplicateOutputError([...duplicateOutputIds]); //[...depdupeEffectiveBaseId(duplicateOutputIds)]);
        }

        return new Module(
            this.isAsync || module.isAsync,
            new Map([...this.#bindings, ...module.#bindings])
        ) as Module<
            Outputs | ModuleOutputs<T>,
            Dependencies | ModuleDependencies<T>,
            T['isAsync'] extends true ? true : Async
        >;
    }

    public static createContainer<
        T extends Module<[Extendable], [Extendable], true>,
    >(
        module: T,
        ...invalidInput: [ModuleDependencies<T>] extends [ModuleOutputs<T>]
            ? []
            : [InvalidInput<'MissingOutput'>]
    ): AsyncContainer<T[typeof typeTracking]['outputs']>;
    public static createContainer<
        T extends Module<[Extendable], [Extendable], false>,
    >(
        module: T,
        ...invalidInput: [ModuleDependencies<T>] extends [ModuleOutputs<T>]
            ? []
            : [InvalidInput<'MissingOutput'>]
    ): SyncContainer<T[typeof typeTracking]['outputs']>;
    public static createContainer<T extends GenericModule>(module: T) {
        return module.isAsync
            ? createAsyncContainer(module.#bindings)
            : createSyncContainer(module.#bindings);
    }
}

export const createModule = Module.fromBinding;
export const createContainer = Module.createContainer;
