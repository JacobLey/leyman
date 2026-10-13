import type { GenericHaywireId } from '#identifier';

/**
 * Generic class to represent errors explicitly thrown by Haywire
 * rather than a provider or other JavaScript failure.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaywireError extends Error {}

/**
 * Message suffix naming the path a request followed to the failing binding.
 *
 * @param requestPath - ids from the requested id to the binding that failed
 * @returns message suffix naming the path, or nothing when the binding was requested directly
 */
const requestedVia = (requestPath: readonly GenericHaywireId[]): string =>
    requestPath.length > 1
        ? ` (requested via ${requestPath.map(id => id.toString()).join(' -> ')})`
        : '';

/**
 * Set `requestPath` as a non-enumerable property. Node prints an error's enumerable properties when it crashes the
 * process, and doesn't use ids' custom inspect there, so a path would add a dozen lines per id before the cause.
 *
 * @param error - error to set the path on
 * @param requestPath - ids from the requested id to the failing binding
 */
const hideRequestPath = (error: Error, requestPath: readonly GenericHaywireId[]): void => {
    Object.defineProperty(error, 'requestPath', { value: requestPath });
};

const stringifyIds = (ids: readonly GenericHaywireId[]): string =>
    ids
        .map(id => id.toString())
        .toSorted((a, b) => a.localeCompare(b, 'en'))
        .join(', ');

/**
 * Generic class to represent validation failures when setting up the
 * bindings and module for Haywire.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaywireModuleValidationError extends HaywireError {}

/**
 * Error thrown when two different bindings both provide the same output value.
 * Haywire will not be able to determine which is the correct provider for the requested type
 * so rejects when merging the bindings in the module.
 *
 * Using Haywire with TypeScript should avoid getting this error, as duplicates are caught as compile time.
 */
export class HaywireDuplicateOutputError extends HaywireModuleValidationError {
    public readonly outputIds: GenericHaywireId[];
    public constructor(outputIds: GenericHaywireId[]) {
        super(`Duplicate output identifier for module: ${stringifyIds(outputIds)}`);
        this.name = 'HaywireDuplicateOutputError';
        this.outputIds = outputIds;
    }
}

/**
 * Error thrown when replacing a binding on a module that has no binding for that output.
 */
export class HaywireBindingNotFoundError extends HaywireModuleValidationError {
    public readonly outputIds: GenericHaywireId[];
    public constructor(outputIds: HaywireBindingNotFoundError['outputIds']) {
        super(`No existing binding to replace for module: ${stringifyIds(outputIds)}`);
        this.name = 'HaywireBindingNotFoundError';
        this.outputIds = outputIds;
    }
}

/**
 * Generic error thrown when validating the container before use.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaywireContainerValidationError extends HaywireError {}

/**
 * Error thrown when a circular dependency is discovered in the container.
 * This is effectively a "Chicken and Egg" problem where providers have dependencies on eachother
 * and it is never possible to have the first value.
 *
 * Ideally this should be addressed by refactoring to remove the circular dependency altogether.
 * If that is not possible, use `identifier.deferred()` for one of the dependencies, to generate a promise
 * that will be resolved later with the circularly generated value.
 */
export class HaywireCircularDependencyError extends HaywireContainerValidationError {
    public readonly circularChains: GenericHaywireId[][];
    public constructor(circularChains: GenericHaywireId[][]) {
        const uniqueChains = HaywireCircularDependencyError.#uniqueChains(circularChains);
        const sortedChains = HaywireCircularDependencyError.#sortChains(uniqueChains);
        super(
            `Circular dependencies detected in container: ${sortedChains
                .map(({ message }) => message)
                .join(', ')}`
        );
        this.name = 'HaywireCircularDependencyError';
        this.circularChains = sortedChains.map(({ chain }) => chain);
    }

    static #uniqueChains(circularChains: GenericHaywireId[][]): Set<GenericHaywireId>[] {
        const uniqueChains: Set<GenericHaywireId>[] = [];
        for (const circularChain of circularChains) {
            const circularSet = new Set(circularChain);
            if (
                uniqueChains.every(uniqueChain => {
                    if (uniqueChain.size !== circularSet.size) {
                        return true;
                    }
                    for (const id of circularSet) {
                        if (!uniqueChain.has(id)) {
                            return true;
                        }
                    }
                    return false;
                })
            ) {
                uniqueChains.push(circularSet);
            }
        }
        return uniqueChains;
    }

    static #sortChains(chains: Set<GenericHaywireId>[]): {
        chain: GenericHaywireId[];
        message: string;
    }[] {
        return chains
            .map(chain => {
                const chainWithMessage = [...chain].map(id => ({
                    id,
                    idStr: id.toString(),
                }));
                const permutations: (typeof chainWithMessage)[] = [];

                for (let i = 0; i < chainWithMessage.length; ++i) {
                    permutations.push([
                        ...chainWithMessage.slice(i),
                        ...chainWithMessage.slice(0, i),
                    ]);
                }

                return permutations
                    .map(permutation => ({
                        chain: permutation.map(({ id }) => id),
                        message: permutation.map(({ idStr }) => idStr).join('->'),
                    }))
                    .toSorted((a, b) => a.message.localeCompare(b.message))[0]!;
            })
            .toSorted((a, b) => a.message.localeCompare(b.message));
    }
}

/**
 * Error thrown when a synchronous supplier is declared for a provider that cannot reliably generate
 * these values syncronously.
 *
 * Either:
 * - Refactor the supplier to be asynchronous itself
 * - Refactor the dependency providers to become synchronous
 * - Use eager scoping to pre-compute an async dependency to be available synchronously.
 */
export class HaywireSyncSupplierError extends HaywireContainerValidationError {
    public readonly unsafeSupplierBindings: {
        /**
         * Output of the binding the supplier would request.
         */
        bindingOutputId: GenericHaywireId;
        /**
         * Supplier id, as declared in the dependencies of `dependentOutputId`'s binding.
         */
        supplierId: GenericHaywireId;
        /**
         * Output of the binding that declares the supplier.
         */
        dependentOutputId: GenericHaywireId;
        /**
         * Chain of dependencies from `bindingOutputId` to the binding that is async (and not eagerly created).
         * A single id when `bindingOutputId` is async itself.
         */
        asyncChain: GenericHaywireId[];
    }[];
    public constructor(unsafeSupplierBindings: HaywireSyncSupplierError['unsafeSupplierBindings']) {
        const bindingToMessage = new Map(
            unsafeSupplierBindings.map(unsafeBinding => [
                unsafeBinding,
                `[output id: ${unsafeBinding.bindingOutputId.toString()}, dependency supplier id: ${unsafeBinding.supplierId.toString()}, needed by: ${unsafeBinding.dependentOutputId.toString()}, async: ${unsafeBinding.asyncChain.map(id => id.toString()).join('->')}]`,
            ])
        );
        unsafeSupplierBindings.sort((a, b) =>
            bindingToMessage.get(a)!.localeCompare(bindingToMessage.get(b)!)
        );
        super(
            `Binding has dependency on syncronous supplier that must be async: ${unsafeSupplierBindings
                .map(unsafeBinding => bindingToMessage.get(unsafeBinding)!)
                .join(', ')}`
        );
        this.name = 'HaywireSyncSupplierError';
        this.unsafeSupplierBindings = unsafeSupplierBindings;
    }
}

/**
 * Error thrown when a container is constructed with declared dependencies that do not exist in the
 * the module's providers.
 *
 * Using Haywire with TypeScript should avoid getting this error, as missing providers are caught as compile time.
 */
export class HaywireProviderMissingError extends HaywireContainerValidationError {
    public readonly dependencyIds: GenericHaywireId[];
    /**
     * Output ids of the bindings that depend on each missing id.
     * Has no entry for an id that was requested from the container directly.
     */
    public readonly dependentIds: ReadonlyMap<GenericHaywireId, readonly GenericHaywireId[]>;
    public constructor(
        dependencyIds: HaywireProviderMissingError['dependencyIds'],
        dependentIds: HaywireProviderMissingError['dependentIds'] = new Map()
    ) {
        super(
            `Providers missing for container: ${dependencyIds
                .map(id => {
                    const dependents = dependentIds.get(id);
                    return dependents?.length
                        ? `${id.toString()} (needed by ${stringifyIds(dependents)})`
                        : id.toString();
                })
                .toSorted((a, b) => a.localeCompare(b, 'en'))
                .join(', ')}`
        );
        this.name = 'HaywireProviderMissingError';
        this.dependencyIds = dependencyIds;
        this.dependentIds = dependentIds;
    }
}

/**
 * Error thrown when a binding that is not singleton-scoped declares a disposer.
 * Containers only keep (and therefore only dispose) singleton instances, so the disposer would never run.
 */
export class HaywireDisposerScopeError extends HaywireContainerValidationError {
    public readonly outputIds: GenericHaywireId[];
    public constructor(outputIds: HaywireDisposerScopeError['outputIds']) {
        super(`Disposers declared for non-singleton bindings: ${stringifyIds(outputIds)}`);
        this.name = 'HaywireDisposerScopeError';
        this.outputIds = outputIds;
    }
}

/**
 * Error thrown when an instance is requested from a container that has been disposed.
 */
export class HaywireContainerDisposedError extends HaywireError {
    public constructor() {
        super('Container has been disposed');
        this.name = 'HaywireContainerDisposedError';
    }
}

/**
 * Generic class to represent failures to generate the requested value during a request.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaywireInstanceValidationError extends HaywireError {}

/**
 * Thrown when the provider returns `null`, when the output is not explicitly declared to be `.nullable()`.
 */
export class HaywireNullResponseError extends HaywireInstanceValidationError {
    public readonly outputId: GenericHaywireId;
    /**
     * Ids followed from the requested id to the failing binding, each as its dependent declared it.
     * Empty when not created by a request. Not enumerable, see {@link hideRequestPath}.
     */
    declare public readonly requestPath: readonly GenericHaywireId[];
    public constructor(
        outputId: HaywireNullResponseError['outputId'],
        requestPath: HaywireNullResponseError['requestPath'] = []
    ) {
        super(
            `Null value returned for non-nullable provider: ${outputId.toString()}${requestedVia(requestPath)}`
        );
        this.name = 'HaywireNullResponseError';
        this.outputId = outputId;
        hideRequestPath(this, requestPath);
    }
}

/**
 * Thrown when the provider returns `undefined`, when the output is not explicitly declared to be `.undefinable()`.
 */
export class HaywireUndefinedResponseError extends HaywireInstanceValidationError {
    public readonly outputId: GenericHaywireId;
    /**
     * Ids followed from the requested id to the failing binding, each as its dependent declared it.
     * Empty when not created by a request. Not enumerable, see {@link hideRequestPath}.
     */
    declare public readonly requestPath: readonly GenericHaywireId[];
    public constructor(
        outputId: HaywireUndefinedResponseError['outputId'],
        requestPath: HaywireUndefinedResponseError['requestPath'] = []
    ) {
        super(
            `Undefined value returned for non-undefinable provider: ${outputId.toString()}${requestedVia(requestPath)}`
        );
        this.name = 'HaywireUndefinedResponseError';
        this.outputId = outputId;
        hideRequestPath(this, requestPath);
    }
}

/**
 * Thrown when the provider returns an instance that is not an `instanceof` the declared output.
 */
export class HaywireInstanceOfResponseError extends HaywireInstanceValidationError {
    public readonly outputId: GenericHaywireId;
    public readonly value: unknown;
    /**
     * Ids followed from the requested id to the failing binding, each as its dependent declared it.
     * Empty when not created by a request. Not enumerable, see {@link hideRequestPath}.
     */
    declare public readonly requestPath: readonly GenericHaywireId[];
    public constructor(
        outputId: GenericHaywireId,
        value: unknown,
        requestPath: HaywireInstanceOfResponseError['requestPath'] = []
    ) {
        super(
            `Value ${HaywireInstanceOfResponseError.#stringify(
                value
            )} returned by provider is not instance of class: ${outputId.toString()}${requestedVia(requestPath)}`
        );
        this.name = 'HaywireInstanceOfResponseError';
        this.outputId = outputId;
        this.value = value;
        hideRequestPath(this, requestPath);
    }

    static #stringify(value: unknown): string {
        const getConstructor = (): { name?: string } | null => {
            if (value && typeof value === 'object') {
                const construct = value.constructor;
                return construct === Object ? null : construct;
            }
            return null;
        };
        return getConstructor()?.name ?? JSON.stringify(value);
    }
}

/**
 * Thrown when a `list('multi')` provider returns a value that is not an array
 * (or `null`/`undefined`, which are treated as a single element).
 */
export class HaywireListResponseError extends HaywireInstanceValidationError {
    public readonly outputId: GenericHaywireId;
    public readonly value: unknown;
    /**
     * Ids followed from the requested id to the failing binding, each as its dependent declared it.
     * Empty when not created by a request. Not enumerable, see {@link hideRequestPath}.
     */
    declare public readonly requestPath: readonly GenericHaywireId[];
    public constructor(
        outputId: GenericHaywireId,
        value: unknown,
        requestPath: HaywireListResponseError['requestPath'] = []
    ) {
        super(
            `Non-array value returned by list provider: ${outputId.toString()}${requestedVia(requestPath)}`
        );
        this.name = 'HaywireListResponseError';
        this.outputId = outputId;
        this.value = value;
        hideRequestPath(this, requestPath);
    }
}

/**
 * Thrown when a provider throws (or its promise rejects). The thrown value is kept as the `cause`, unchanged.
 *
 * Errors thrown by Haywire itself (e.g. by a supplier the provider called) are not wrapped again.
 * Containers created with `unsafeRawProviderErrors` throw the provider's error as is instead.
 */
export class HaywireProviderError extends HaywireInstanceValidationError {
    public readonly outputId: GenericHaywireId;
    /**
     * Ids followed from the requested id to the failing binding, each as its dependent declared it.
     * Empty when not created by a request. Not enumerable, see {@link hideRequestPath}.
     */
    declare public readonly requestPath: readonly GenericHaywireId[];
    public constructor(
        outputId: GenericHaywireId,
        cause: unknown,
        requestPath: HaywireProviderError['requestPath'] = []
    ) {
        super(
            `Provider for ${outputId.toString()} failed${requestedVia(requestPath)}: ${HaywireProviderError.#describe(cause)}`,
            { cause }
        );
        this.name = 'HaywireProviderError';
        this.outputId = outputId;
        hideRequestPath(this, requestPath);
    }

    static #describe(cause: unknown): string {
        if (Error.isError(cause)) {
            return cause.message;
        }
        try {
            return String(cause);
        } catch {
            // For example `Object.create(null)`, which has no `toString()`
            return typeof cause;
        }
    }
}

/**
 * Thrown when multiple providers fail to generate the required value.
 * These errors may have been thrown explicitly by the provider itself, or as part of other validations
 * that are `HaywireInstanceValidationError`.
 *
 * Will always contain >1 `causes`, which are never themselves `HaywireMultiError`s.
 */
export class HaywireMultiError extends HaywireInstanceValidationError {
    public readonly causes: unknown[];

    public constructor(errors: unknown[]) {
        const causes = errors.flatMap(err =>
            err instanceof HaywireMultiError ? err.causes : [err]
        );
        super(
            `Multiple errors: [${causes
                .map(err => (Error.isError(err) ? err.message : err))
                .join(', ')}]`,
            { cause: causes[0] }
        );
        this.name = 'HaywireMultiError';
        this.causes = causes;
    }
}

/**
 * Throw the error of the one rejected promise, or a {@link HaywireMultiError} of every rejection.
 * Not exported from the package: it is not part of the error's API.
 *
 * @param settled - results of `Promise.allSettled()`
 * @throws the rejection, or a `HaywireMultiError` of every rejection
 */
export const validateAllSettled: <T>(
    settled: PromiseSettledResult<T>[]
) => asserts settled is PromiseFulfilledResult<T>[] = settled => {
    const rejected = settled.filter(
        (settle): settle is PromiseRejectedResult => settle.status === 'rejected'
    );
    if (rejected.length > 0) {
        throw rejected.length === 1
            ? rejected[0]!.reason
            : new HaywireMultiError(rejected.map(err => err.reason as unknown));
    }
};
