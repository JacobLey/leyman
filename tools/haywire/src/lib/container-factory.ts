import type { BindingListOutputType, BindingOutputType, GenericBinding } from '#binding';
import type { Container, ExpandedContainer, MaybeSyncContainer } from '#container';
import type {
    ClassToConstructable,
    GenericBaseHaywireId,
    GenericHaywireId,
    GenericOutputHaywireId,
    HaywireIdProviderType,
    OutputHaywireId,
} from '#identifier';
import type {
    CombineListOutputs,
    ValidateOutputIdDoesNotExist,
    ValidateOutputSatisfiesDependency,
} from '#module';
import type { Extendable, InstanceOfClass, InvalidInput, IsClass } from '#types';
import { InstanceBinding, normalizeOutputId, TempBinding } from '#binding';
import { addBoundInstances, createAsyncContainer, createSyncContainer } from '#container';
import { HaywireDuplicateOutputError, HaywireProviderMissingError } from '#errors';
import { expandOutputId, expandSharedOutputIds, unsafeIdentifier } from '#identifier';

export type GenericContainerFactory = ContainerFactory<any, any, any, any>;

type ValidateBindInstance<
    Outputs extends [Extendable],
    Dependencies extends [Extendable],
    Bindings extends InstanceBinding<GenericHaywireId>,
    OutputId extends GenericOutputHaywireId,
> = [
    ...ValidateOutputIdDoesNotExist<
        BindingOutputType<Bindings['outputId']> | Outputs,
        BindingOutputType<OutputId>
    >,
    ...ValidateOutputSatisfiesDependency<
        Dependencies,
        BindingListOutputType<OutputId> | BindingOutputType<OutputId>
    >,
] &
    [];

/**
 * Verify that the container has no dependencies remaining unbound before exposing the container.
 * Exclude outputs before checking (even though dependencies _should_ already do that) so that `GenericContainerFactory` templates
 * can use this method.
 *
 * @template F - factory
 */
type ValidateToContainer<F extends GenericContainerFactory> = [] &
    ([Exclude<F[typeof idType]['dependencies'], F[typeof idType]['outputs']>] extends [never]
        ? []
        : [InvalidInput<'MissingOutput'>]);

const wireContainerFactorySym = Symbol('wireContainerFactory');

declare const idType: unique symbol;

/**
 * A wrapper around a wired container with temporary bindings.
 *
 * The factory needs to be provided with instances for the missing bindings, at which point it can be exchanged
 * for a container that is ready for use.
 *
 * @template Outputs values that container is currently able to emit
 * @template Dependencies dependencies declared on the module, _excluding_ outputs from both module and instance bindings.
 * List dependencies are always retained (even if satisfied) so that registered list elements can be validated against them.
 * @template Async if false, will result in a SyncContainer
 * @template Bindings instance bindings that are ready to be attached to container
 */
export class ContainerFactory<
    Outputs extends [Extendable],
    Dependencies extends [Extendable],
    Async extends boolean,
    Bindings extends InstanceBinding<GenericHaywireId>,
> {
    public declare [idType]: {
        outputs: Outputs;
        dependencies: Dependencies;
        async: Async;
        bindings: Bindings;
    };

    readonly #container: MaybeSyncContainer<Outputs, Async>;
    readonly #missingDependencyOutputsByBaseId: Map<GenericBaseHaywireId, GenericOutputHaywireId[]>;
    readonly #existingOutputBaseIds: Set<GenericBaseHaywireId>;
    /**
     * Every list dependency declared in the module (satisfied or not), keyed by base id.
     * Registered list elements must continue to satisfy all of these.
     */
    readonly #listDependencyOutputsByBaseId: ReadonlyMap<
        GenericBaseHaywireId,
        readonly GenericOutputHaywireId[]
    >;
    /**
     * Output ids that are satisfied by every list binding (from module and registered instances), keyed by base id.
     */
    readonly #listOutputIdsByBaseId: Map<GenericBaseHaywireId, ReadonlySet<GenericOutputHaywireId>>;
    readonly #registeredBindings: Bindings[];

    private constructor(
        container: MaybeSyncContainer<Outputs, Async>,
        missingDependencyOutputsByBaseId: Map<GenericBaseHaywireId, GenericOutputHaywireId[]>,
        existingOutputBaseIds: Set<GenericBaseHaywireId>,
        listDependencyOutputsByBaseId: ReadonlyMap<
            GenericBaseHaywireId,
            readonly GenericOutputHaywireId[]
        >,
        listOutputIdsByBaseId: ReadonlyMap<
            GenericBaseHaywireId,
            ReadonlySet<GenericOutputHaywireId>
        >,
        registeredBindings: Bindings[]
    ) {
        this.#container = container;
        this.#missingDependencyOutputsByBaseId = new Map(missingDependencyOutputsByBaseId);
        this.#existingOutputBaseIds = new Set(existingOutputBaseIds);
        this.#listDependencyOutputsByBaseId = listDependencyOutputsByBaseId;
        this.#listOutputIdsByBaseId = new Map(listOutputIdsByBaseId);
        this.#registeredBindings = [...registeredBindings];
    }

    public static [wireContainerFactorySym]?<
        Outputs extends [Extendable],
        Dependencies extends [Extendable],
        Async extends boolean,
    >(
        this: void,
        bindings: ReadonlyMap<GenericBaseHaywireId, GenericBinding>,
        listBindings: ReadonlyMap<GenericBaseHaywireId, readonly GenericBinding[]>,
        isAsync: Async
    ): ContainerFactory<Outputs, Dependencies, Async, never> {
        const outputIds = new Set(
            [...bindings.values()].flatMap(binding => [...expandOutputId(binding.outputId)])
        );
        const listOutputIdsByBaseId = new Map(
            [...listBindings].map(([baseId, bindingsForList]) => [
                baseId,
                expandSharedOutputIds(
                    baseId,
                    bindingsForList.map(binding => binding.outputId)
                ),
            ])
        );
        // Dependencies are compared as outputs, so suppliers + deferred dependencies are satisfied by the underlying output.
        const dependencyIds = new Set(
            [...bindings.values(), ...listBindings.values()]
                .flat()
                .flatMap(binding => binding.dependencyIds.map(id => normalizeOutputId(id)))
        );

        const listDependencyOutputsByBaseId = new Map<
            GenericBaseHaywireId,
            GenericOutputHaywireId[]
        >();
        const missingDependencyOutputsByBaseId = new Map<
            GenericBaseHaywireId,
            GenericOutputHaywireId[]
        >();
        // Widen type, `normalizeOutputId` loses track of the list annotation (see container `checkIsList`)
        for (const dependencyId of dependencyIds as Set<GenericOutputHaywireId>) {
            const baseId = dependencyId.baseId();
            let isMissing: boolean;
            if (dependencyId.annotations.list) {
                const listDependencies = listDependencyOutputsByBaseId.get(baseId) ?? [];
                listDependencies.push(dependencyId);
                listDependencyOutputsByBaseId.set(baseId, listDependencies);
                isMissing = !listOutputIdsByBaseId.get(baseId)?.has(dependencyId);
            } else {
                isMissing = !outputIds.has(dependencyId);
            }
            if (isMissing) {
                const allMissing = missingDependencyOutputsByBaseId.get(baseId) ?? [];
                allMissing.push(dependencyId);
                missingDependencyOutputsByBaseId.set(baseId, allMissing);
            }
        }

        const missingImplementationBindings = new Map<GenericBaseHaywireId, GenericBinding>();
        const missingImplementationListBindings = new Map<GenericBaseHaywireId, GenericBinding[]>();
        for (const [baseId, dependencyOutputIds] of missingDependencyOutputsByBaseId) {
            // If the module already declares bindings for this output, they are too lax to satisfy
            // the dependency. Keep them rather than replacing with a temp binding, the dependency remains missing
            // (and for lists, registering further instances will not be able to satisfy it either).
            if (baseId.annotations.list ? listBindings.has(baseId) : bindings.has(baseId)) {
                continue;
            }

            let laxestId: GenericOutputHaywireId = baseId;
            if (dependencyOutputIds.every(outputId => outputId.annotations.nullable)) {
                laxestId = laxestId.nullable();
            }
            if (dependencyOutputIds.every(outputId => outputId.annotations.undefinable)) {
                laxestId = laxestId.undefinable();
            }

            const tempBinding = new TempBinding(laxestId);
            if (laxestId.annotations.list) {
                missingImplementationListBindings.set(baseId, [tempBinding]);
            } else {
                missingImplementationBindings.set(baseId, tempBinding);
            }
        }

        const mergedBindings = new Map([...bindings, ...missingImplementationBindings]);
        const mergedListBindings = new Map([...listBindings, ...missingImplementationListBindings]);

        const container: Container<Outputs> = isAsync
            ? createAsyncContainer(mergedBindings, mergedListBindings)
            : createSyncContainer(mergedBindings, mergedListBindings);

        const existingOutputBaseIds = new Set(
            // Only need to track non-list, because duplicating lists are explicitly allowed
            bindings.keys()
        );

        return new ContainerFactory<Outputs, Dependencies, Async, never>(
            container as MaybeSyncContainer<Outputs, Async>,
            missingDependencyOutputsByBaseId,
            existingOutputBaseIds,
            listDependencyOutputsByBaseId,
            listOutputIdsByBaseId,
            []
        );
    }

    /**
     * Checks the underlying container.
     * Uses {@link Container.check()} directly.
     *
     * Recommended to be called as an optimization, becaues check the factory
     * will ensure _every_ resulting container is pre-checked.
     */
    public check(): void {
        this.#container.check();
    }

    /**
     * Wires the underlying container.
     * Uses {@link Container.wire()} directly.
     *
     * Recommended to be called as an optimization, becaues wiring the factory
     * will ensure _every_ resulting container is pre-wired.
     */
    public wire(): void {
        this.#container.wire();
    }

    /**
     * Bind an output id to a corresponding instance.
     *
     * Equivalent to adding a `bind(outputId).withInstance(instance)` binding, so there is no provider, dependencies, or ability to make it async.
     *
     * Call will fail if an existing output has already been declared that has overlap with this.
     *
     * Returns a new instance of ContainerFactory, so the original is not mutated and can have multiple different types injected to it.
     * The new ContainerFactory also has types updated, to prevent duplicate output ids in future registrations.
     *
     * @param outputId - id defining type of instance
     * @param instance - instance to provide to all bindings
     * @param invalidInput - Enforces that incoming `outputId` is not a duplicate of existing ids
     */
    public bindInstance<OutputId extends GenericHaywireId>(
        outputId: OutputId,
        instance: HaywireIdProviderType<OutputId>,
        ...invalidInput: ValidateBindInstance<
            Outputs,
            Dependencies,
            Bindings,
            OutputHaywireId<OutputId>
        >
    ): ContainerFactory<
        CombineListOutputs<Outputs, BindingListOutputType<OutputHaywireId<OutputId>>>,
        Exclude<Dependencies, BindingOutputType<OutputHaywireId<OutputId>>>,
        Async,
        Bindings | InstanceBinding<OutputId>
    >;
    public bindInstance<Constructor extends IsClass>(
        clazz: Constructor,
        instance: InstanceOfClass<Constructor>,
        ...invalidInput: ValidateBindInstance<
            Outputs,
            Dependencies,
            Bindings,
            ClassToConstructable<Constructor>
        >
    ): ContainerFactory<
        Outputs,
        Exclude<Dependencies, BindingOutputType<ClassToConstructable<Constructor>>>,
        Async,
        Bindings | InstanceBinding<ClassToConstructable<Constructor>>
    >;
    public bindInstance<OutputId extends GenericHaywireId>(
        outputIdOrClass: OutputId,
        instance: HaywireIdProviderType<OutputId>
    ): ContainerFactory<any, any, Async, Bindings | InstanceBinding<OutputId>> {
        const outputId = unsafeIdentifier(outputIdOrClass);
        const normalizedOutputId = normalizeOutputId(outputId);
        const baseId = outputId.baseId();

        if (this.#existingOutputBaseIds.has(baseId)) {
            throw new HaywireDuplicateOutputError([outputId]);
        }

        let listOutputIds: ReadonlySet<GenericOutputHaywireId> | null = null;
        if (baseId.annotations.list) {
            // Every list element (existing and new) must satisfy every list dependency.
            listOutputIds = (
                this.#listOutputIdsByBaseId.get(baseId) ?? expandOutputId(baseId)
            ).intersection(expandOutputId(normalizedOutputId));
            const stillMissing = new Set(
                this.#listDependencyOutputsByBaseId.get(baseId)
            ).difference(listOutputIds);
            if (stillMissing.size > 0) {
                throw new HaywireProviderMissingError([...stillMissing]);
            }
        } else {
            const missingDependencyOutputs = this.#missingDependencyOutputsByBaseId.get(baseId);
            if (missingDependencyOutputs) {
                const actualOutputs = expandOutputId(normalizedOutputId);
                const stillMissing = new Set(missingDependencyOutputs).difference(actualOutputs);
                if (stillMissing.size > 0) {
                    throw new HaywireProviderMissingError([...stillMissing]);
                }
            }
        }

        const factory = new ContainerFactory<
            Outputs,
            Exclude<Dependencies, any>,
            Async,
            Bindings | InstanceBinding<OutputId>
        >(
            this.#container,
            this.#missingDependencyOutputsByBaseId,
            this.#existingOutputBaseIds,
            this.#listDependencyOutputsByBaseId,
            this.#listOutputIdsByBaseId,
            this.#registeredBindings
        );
        factory.#missingDependencyOutputsByBaseId.delete(baseId);
        if (listOutputIds) {
            // List ids are acceptable to provide more than once.
            factory.#listOutputIdsByBaseId.set(baseId, listOutputIds);
        } else {
            // Regular ids can only be provided once.
            factory.#existingOutputBaseIds.add(baseId);
        }
        const binding = new InstanceBinding(outputId, instance);
        factory.#registeredBindings.push(binding);

        return factory;
    }

    /**
     * Produce the final container that is capable of outputting requested instances.
     *
     * Will return a new instance every time, although pre-wiring the container via {@link ContainerFactory.wire()}
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

    public static createContainer<F extends GenericContainerFactory>(
        this: void,
        factory: F,
        ...invalidInput: ValidateToContainer<F>
    ): ReturnType<F['toContainer']>;
    public static createContainer<F extends GenericContainerFactory>(
        this: void,
        factory: F
    ): ReturnType<F['toContainer']> {
        return (factory as GenericContainerFactory).toContainer() as ReturnType<F['toContainer']>;
    }
}

export const wireContainerFactory = ContainerFactory[wireContainerFactorySym]!;
delete ContainerFactory[wireContainerFactorySym];

export const { createContainer } = ContainerFactory;
