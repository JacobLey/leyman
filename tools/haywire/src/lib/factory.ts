import {
    type BindingOutputType,
    type GenericBinding,
    InstanceBinding,
    TempBinding,
} from '#binding';
import {
    addBoundInstances,
    type AsyncContainer,
    type Container,
    createAsyncContainer,
    createSyncContainer,
    type ExpandedContainer,
} from '#container';
import { HaywireDuplicateOutputError, HaywireProviderMissingError } from '#errors';
import {
    type ClassToConstructable,
    expandOutputId,
    type GenericHaywireId,
    type GenericOutputHaywireId,
    type HaywireIdType,
    type OutputHaywireId,
    unsafeIdentifier,
} from '#identifier';
import type { ValidateOutputIdDoesNotExist, ValidateOutputSatisfiesDependency } from '#module';
import type { Extendable, InstanceOfClass, InvalidInput, IsClass } from '#types';

export type GenericFactory = Factory<any, any, any, any>;

type ValidateRegister<
    Outputs extends [Extendable],
    Dependencies extends [Extendable],
    Bindings extends InstanceBinding<GenericOutputHaywireId>,
    OutputId extends GenericHaywireId,
> = [
    ...ValidateOutputIdDoesNotExist<
        BindingOutputType<Bindings['outputId']> | Outputs,
        BindingOutputType<OutputId>
    >,
    ...ValidateOutputSatisfiesDependency<Dependencies, BindingOutputType<OutputId>>,
] &
    [];

/**
 * Verify that the container has no dependencies remaining unbound before exposing the container.
 * Exclude outputs before checking (even though dependencies _should_ already do that) so that `GenericFactory` templates
 * can use this method.
 *
 * @template F - factory
 */
type ValidateToContainer<F extends GenericFactory> = [] &
    ([Exclude<F[typeof idType]['dependencies'], F[typeof idType]['outputs']>] extends [never]
        ? []
        : [InvalidInput<'MissingOutput'>]);

const wireFactorySym = Symbol('wireFactory');

declare const idType: unique symbol;

/**
 * A wrapper around a wired container with temporary bindings.
 *
 * The factory needs to be provided with instances for the missing bindings, at which point it can be exchanged
 * for a container that is ready for use.
 *
 * @template Outputs values that container is currently able to emit
 * @template Dependencies dependencies declared on the module, _excluding_ outputs from both module and instance bindings
 * @template Async if false, will result in a SyncContainer
 * @template Bindings instance bindings that are ready to be attached to container
 */
export class Factory<
    Outputs extends [Extendable],
    Dependencies extends [Extendable],
    Async extends boolean,
    Bindings extends InstanceBinding<GenericOutputHaywireId>,
> {
    public declare [idType]: {
        outputs: Outputs;
        dependencies: Dependencies;
        async: Async;
        bindings: Bindings;
    };

    readonly #container: Container<Outputs, Async>;
    readonly #missingDependencyOutputsByBaseId: Map<
        GenericOutputHaywireId,
        GenericOutputHaywireId[]
    >;
    readonly #existingOutputBaseIds: Set<GenericOutputHaywireId>;
    readonly #registeredBindings: Bindings[];

    private constructor(
        container: Container<Outputs, Async>,
        missingDependencyOutputsByBaseId: Map<GenericOutputHaywireId, GenericOutputHaywireId[]>,
        existingOutputBaseIds: Set<GenericOutputHaywireId>,
        registeredBindings: Bindings[]
    ) {
        this.#container = container;
        this.#missingDependencyOutputsByBaseId = new Map(missingDependencyOutputsByBaseId);
        this.#existingOutputBaseIds = new Set(existingOutputBaseIds);
        this.#registeredBindings = [...registeredBindings];
    }

    public static [wireFactorySym]?<
        Outputs extends [Extendable],
        Dependencies extends [Extendable],
        Async extends boolean,
    >(
        this: void,
        bindings: ReadonlyMap<GenericOutputHaywireId, GenericBinding>,
        isAsync: Async
    ): Factory<Outputs, Dependencies, Async, never> {
        const outputIds = new Set(bindings.keys());
        const dependencyIds = new Set(
            [...bindings.values()].flatMap(binding => binding.dependencyIds)
        );

        const missingDependencyOutputsByBaseId = new Map<
            GenericOutputHaywireId,
            GenericOutputHaywireId[]
        >();
        for (const missingDependency of dependencyIds.difference(outputIds)) {
            const outputMissingDependency = missingDependency.supplier(false).lateBinding(false);
            const allMissing =
                missingDependencyOutputsByBaseId.get(outputMissingDependency.baseId()) ?? [];
            allMissing.push(outputMissingDependency);
            missingDependencyOutputsByBaseId.set(outputMissingDependency.baseId(), allMissing);
        }

        const missingImplementationBindings = new Map<GenericOutputHaywireId, GenericBinding>();
        for (const [baseId, dependencyOutputIds] of missingDependencyOutputsByBaseId) {
            let laxestId = baseId;
            if (dependencyOutputIds.every(outputId => outputId.annotations.nullable)) {
                laxestId = laxestId.nullable();
            }
            if (dependencyOutputIds.every(outputId => outputId.annotations.undefinable)) {
                laxestId = laxestId.undefinable();
            }

            const tempBinding = new TempBinding(laxestId);
            for (const id of expandOutputId(laxestId)) {
                missingImplementationBindings.set(id, tempBinding);
            }
        }

        const mergedBindings = new Map([...bindings, ...missingImplementationBindings]);

        const container: AsyncContainer<Outputs> = isAsync
            ? createAsyncContainer(mergedBindings)
            : createSyncContainer(mergedBindings);

        const existingOutputBaseIds = new Set([...bindings.keys()].map(id => id.baseId()));

        return new Factory<Outputs, Dependencies, Async, never>(
            container as Container<Outputs, Async>,
            missingDependencyOutputsByBaseId,
            existingOutputBaseIds,
            []
        );
    }

    /**
     * Checks the underlying container.
     * Uses {@link AsyncContainer.check()} directly.
     *
     * Recommended to be called as an optimization, becaues check the factory
     * will ensure _every_ resulting container is pre-checked.
     */
    public check(): void {
        this.#container.check();
    }

    /**
     * Wires the underlying container.
     * Uses {@link AsyncContainer.wire()} directly.
     *
     * Recommended to be called as an optimization, becaues wiring the factory
     * will ensure _every_ resulting container is pre-wired.
     */
    public wire(): void {
        this.#container.wire();
    }

    /**
     * Register an output id to a corresponding instance.
     *
     * Similar to binding, but there is no provider, dependencies, or ability to make it async.
     *
     * Call will fail if an existing output has already been declared that has overlap with this.
     *
     * Returns a new instance of Factory, so the original is not mutated and can have multiple different types injected to it.
     * The new Factory also has types updated, to prevent duplicate output ids in future registrations.
     *
     * @param outputId - id defining type of instance
     * @param instance - instance to provide to all bindings
     * @param invalidInput - Enforces that incoming `outputId` is not a duplicate of existing ids
     */
    public register<OutputId extends GenericHaywireId>(
        outputId: OutputId,
        instance: HaywireIdType<OutputHaywireId<OutputId>>,
        ...invalidInput: ValidateRegister<Outputs, Dependencies, Bindings, OutputId>
    ): Factory<
        Outputs,
        Exclude<Dependencies, BindingOutputType<OutputId>>,
        Async,
        Bindings | InstanceBinding<OutputHaywireId<OutputId>>
    >;
    public register<Constructor extends IsClass>(
        clazz: Constructor,
        instance: InstanceOfClass<Constructor>,
        ...invalidInput: ValidateRegister<
            Outputs,
            Dependencies,
            Bindings,
            ClassToConstructable<Constructor>
        >
    ): Factory<
        Outputs,
        Exclude<Dependencies, BindingOutputType<ClassToConstructable<Constructor>>>,
        Async,
        Bindings | InstanceBinding<ClassToConstructable<Constructor>>
    >;
    public register<OutputId extends GenericHaywireId>(
        outputIdOrClass: OutputId,
        instance: HaywireIdType<OutputId>
    ): Factory<Outputs, any, Async, Bindings | InstanceBinding<OutputHaywireId<OutputId>>> {
        const outputId = unsafeIdentifier(outputIdOrClass);
        const baseId = outputId.baseId();

        if (this.#existingOutputBaseIds.has(baseId)) {
            throw new HaywireDuplicateOutputError([outputId]);
        }

        const missingDependencyOutputs = this.#missingDependencyOutputsByBaseId.get(baseId);
        if (missingDependencyOutputs) {
            const actualOutputs = new Set(expandOutputId(outputId));
            const stillMissing = new Set(missingDependencyOutputs).difference(actualOutputs);
            if (stillMissing.size > 0) {
                throw new HaywireProviderMissingError([...stillMissing]);
            }
        }

        const factory = new Factory<
            Outputs,
            Exclude<Dependencies, any>,
            Async,
            Bindings | InstanceBinding<OutputHaywireId<OutputId>>
        >(
            this.#container,
            this.#missingDependencyOutputsByBaseId,
            this.#existingOutputBaseIds,
            this.#registeredBindings
        );
        factory.#missingDependencyOutputsByBaseId.delete(baseId);
        factory.#existingOutputBaseIds.add(baseId);
        factory.#registeredBindings.push(
            new InstanceBinding(outputId.supplier(false).lateBinding(false), instance)
        );

        return factory;
    }

    /**
     * Produce the final container that is capable of outputting requested instances.
     *
     * Will return a new instance every time, although pre-wiring the container via {@link Factory.wire()}
     * will be applied to each instance as an optimization.
     *
     * If bindings have been declared with dependencies that are not yet satisfied by existing outputs,
     * the call will fail (and be typed as invalid).
     */
    public toContainer(
        ...invalidInput: ValidateToContainer<this>
    ): ExpandedContainer<Outputs, Bindings, Async>;
    public toContainer(): ExpandedContainer<Outputs, Bindings, Async> {
        if (this.#missingDependencyOutputsByBaseId.size > 0) {
            throw new HaywireProviderMissingError(
                [...this.#missingDependencyOutputsByBaseId.values()].flat()
            );
        }

        return addBoundInstances(this.#container, this.#registeredBindings);
    }

    public static createContainer<F extends GenericFactory>(
        this: void,
        factory: F,
        ...invalidInput: ValidateToContainer<F>
    ): ReturnType<F['toContainer']>;
    public static createContainer<F extends GenericFactory>(
        this: void,
        factory: F
    ): ReturnType<F['toContainer']> {
        return (factory as GenericFactory).toContainer() as ReturnType<F['toContainer']>;
    }
}

export const wireFactory = Factory[wireFactorySym]!;
delete Factory[wireFactorySym];

export const { createContainer } = Factory;
