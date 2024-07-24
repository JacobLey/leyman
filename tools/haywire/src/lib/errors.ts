import type { GenericHaywireId } from '#identifier';

/**
 * Generic class to represent errors explicitly thrown by Haywire
 * rather than a provider or other javascript failure.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaywireError extends Error {}

const stringifyIds = (ids: GenericHaywireId[]): string =>
    ids
        .map(id => id.toString())
        .sort()
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
 * Using Haywire with Typescript should avoid getting this error, as duplicates are caught as compile time.
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
 * If that is not possible, use `identifier.lateBinding()` for one of the dependencies, to generate a promise
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
                    .sort((a, b) => a.message.localeCompare(b.message))[0]!;
            })
            .sort((a, b) => a.message.localeCompare(b.message));
    }
}

/**
 * Error thrown when a synchronous supplier is declared for a provider that cannot reliably generate
 * these values syncronously.
 *
 * Either:
 * - Refactor the supplier to be asynchronous itself
 * - Refactor the dependency providers to become synchronous
 * - Use optimistic scoping to pre-compute an async dependency to be available synchronously.
 */
export class HaywireSyncSupplierError extends HaywireContainerValidationError {
    public readonly unsafeSupplierBindings: {
        bindingOutputId: GenericHaywireId;
        supplierId: GenericHaywireId;
    }[];
    public constructor(unsafeSupplierBindings: HaywireSyncSupplierError['unsafeSupplierBindings']) {
        const bindingToMessage = new Map(
            unsafeSupplierBindings.map(unsafeBinding => [
                unsafeBinding,
                `[output id: ${unsafeBinding.bindingOutputId.toString()}, dependency supplier id: ${unsafeBinding.supplierId.toString()}]`,
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
 * Using Haywire with Typescript should avoid getting this error, as missing providers are caught as compile time.
 */
export class HaywireProviderMissingError extends HaywireContainerValidationError {
    public readonly dependencyIds: GenericHaywireId[];
    public constructor(dependencyIds: HaywireProviderMissingError['dependencyIds']) {
        super(`Providers missing for container: ${stringifyIds(dependencyIds)}`);
        this.name = 'HaywireProviderMissingError';
        this.dependencyIds = dependencyIds;
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
    public constructor(outputId: HaywireNullResponseError['outputId']) {
        super(`Null value returned for non-nullable provider: ${outputId.toString()}`);
        this.name = 'HaywireNullResponseError';
        this.outputId = outputId;
    }
}

/**
 * Thrown when the provider returns `undefined`, when the output is not explicitly declared to be `.undefinable()`.
 */
export class HaywireUndefinedResponseError extends HaywireInstanceValidationError {
    public readonly outputId: GenericHaywireId;
    public constructor(outputId: HaywireUndefinedResponseError['outputId']) {
        super(`Undefined value returned for non-undefinable provider: ${outputId.toString()}`);
        this.name = 'HaywireUndefinedResponseError';
        this.outputId = outputId;
    }
}

/**
 * Thrown when the provider returns an instance that is not an `instanceof` the declared output.
 */
export class HaywireInstanceOfResponseError extends HaywireInstanceValidationError {
    public readonly outputId: GenericHaywireId;
    public readonly value: unknown;
    public constructor(outputId: GenericHaywireId, value: unknown) {
        super(
            `Value ${HaywireInstanceOfResponseError.#stringify(
                value
            )} returned by provider is not instance of class: ${outputId.toString()}`
        );
        this.name = 'HaywireInstanceOfResponseError';
        this.outputId = outputId;
        this.value = value;
    }

    static #stringify(value: unknown): string {
        const getConstructor = (): { name?: string } | null => {
            if (value && typeof value === 'object') {
                const { constructor } = value;
                return constructor === Object ? null : constructor;
            }
            return null;
        };
        return getConstructor()?.name ?? JSON.stringify(value);
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
                .map(err => (err instanceof Error ? err.message : err))
                .join(', ')}]`,
            { cause: causes[0] }
        );
        this.name = 'HaywireMultiError';
        this.causes = causes;
    }

    public static validateAllSettled<T>(
        settled: PromiseSettledResult<T>[]
    ): asserts settled is PromiseFulfilledResult<T>[] {
        const rejected = settled.filter(
            (settle): settle is PromiseRejectedResult => settle.status === 'rejected'
        );
        if (rejected.length > 0) {
            throw rejected.length === 1
                ? rejected[0]!.reason
                : new HaywireMultiError(rejected.map(err => err.reason as unknown));
        }
    }
}
