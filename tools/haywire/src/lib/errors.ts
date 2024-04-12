import type { GenericHaystackId } from '#identifier';

/**
 * Generic class to represent errors explicitly thrown by Haystack
 * rather than a provider or other javascript failure.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaystackError extends Error {}

const stringifyId = (id: GenericHaystackId): string => {
    let text = id.id;
    const { annotations } = id;
    const annotationsText = [
        annotations.named === null
            ? null
            : (`named: ${String(annotations.named)}` as const),
        annotations.nullable && ('nullable' as const),
        annotations.undefinable && ('undefinable' as const),
        typeof annotations.supplier === 'object' &&
            (`supplier(${[
                annotations.supplier.sync ? 'sync' : 'async',
                annotations.supplier.propagateScope && 'propagating',
            ]
                .filter(Boolean)
                .join(', ')})` as const),
        annotations.lateBinding && ('late-binding' as const),
    ].filter(Boolean);
    if (annotationsText.length > 0) {
        text += `(${annotationsText.join(', ')})`;
    }
    return text;
};
const stringifyIds = (ids: GenericHaystackId[]): string =>
    ids
        .map(id => stringifyId(id))
        .sort()
        .join(', ');

/**
 * Generic class to represent validation failures when setting up the
 * bindings and module for Haystack.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaystackModuleValidationError extends HaystackError {}

/**
 * Error thrown when two different bindings both provide the same output value.
 * Haystack will not be able to determine which is the correct provider for the requested type
 * so rejects when merging the bindings in the module.
 *
 * Using Haystack with Typescript should avoid getting this error, as duplicates are caught as compile time.
 */
export class HaystackDuplicateOutputError extends HaystackModuleValidationError {
    public readonly outputIds: GenericHaystackId[];
    public constructor(outputIds: GenericHaystackId[]) {
        super(
            `Duplicate output identifier for module: ${stringifyIds(outputIds)}`
        );
        this.name = 'HaystackDuplicateOutputError';
        this.outputIds = outputIds;
    }
}

/**
 * Generic error thrown when validating the container before use.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaystackContainerValidationError extends HaystackError {}

/**
 * Error thrown when a circular dependency is discovered in the container.
 * This is effectively a "Chicken and Egg" problem where providers have dependencies on eachother
 * and it is never possible to have the first value.
 *
 * Ideally this should be addressed by refactoring to remove the circular dependency altogether.
 * If that is not possible, use `identifier.lateBinding()` for one of the dependencies, to generate a promise
 * that will be resolved later with the circularly generated value.
 */
export class HaystackCircularDependencyError extends HaystackContainerValidationError {
    public readonly circularChains: GenericHaystackId[][];
    public constructor(circularChains: GenericHaystackId[][]) {
        const uniqueChains =
            HaystackCircularDependencyError.#uniqueChains(circularChains);
        const sortedChains =
            HaystackCircularDependencyError.#sortChains(uniqueChains);
        super(
            `Circular dependencies detected in container: ${sortedChains
                .map(({ message }) => message)
                .join(', ')}`
        );
        this.name = 'HaystackCircularDependencyError';
        this.circularChains = sortedChains.map(({ chain }) => chain);
    }

    static #uniqueChains(
        circularChains: GenericHaystackId[][]
    ): Set<GenericHaystackId>[] {
        const uniqueChains: Set<GenericHaystackId>[] = [];
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

    static #sortChains(chains: Set<GenericHaystackId>[]): {
        chain: GenericHaystackId[];
        message: string;
    }[] {
        return chains
            .map(chain => {
                const chainWithMessage = [...chain].map(id => ({
                    id,
                    idStr: stringifyId(id),
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
                        message: permutation
                            .map(({ idStr }) => idStr)
                            .join('->'),
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
export class HaystackSyncSupplierError extends HaystackContainerValidationError {
    public readonly unsafeSupplierBindings: {
        bindingOutputId: GenericHaystackId;
        supplierId: GenericHaystackId;
    }[];
    public constructor(
        unsafeSupplierBindings: HaystackSyncSupplierError['unsafeSupplierBindings']
    ) {
        const bindingToMessage = new Map(
            unsafeSupplierBindings.map(unsafeBinding => [
                unsafeBinding,
                `[output id: ${stringifyId(
                    unsafeBinding.bindingOutputId
                )}, dependency supplier id: ${stringifyId(
                    unsafeBinding.supplierId
                )}]`,
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
        this.name = 'HaystackSyncSupplierError';
        this.unsafeSupplierBindings = unsafeSupplierBindings;
    }
}

/**
 * Error thrown when a container is constructed with declared dependencies that do not exist in the
 * the module's providers.
 *
 * Using Haystack with Typescript should avoid getting this error, as missing providers are caught as compile time.
 */
export class HaystackProviderMissingError extends HaystackContainerValidationError {
    public readonly dependencyIds: GenericHaystackId[];
    public constructor(
        dependencyIds: HaystackProviderMissingError['dependencyIds']
    ) {
        super(
            `Providers missing for container: ${stringifyIds(dependencyIds)}`
        );
        this.name = 'HaystackProviderMissingError';
        this.dependencyIds = dependencyIds;
    }
}

/**
 * Generic class to represent failures to generate the requested value during a request.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class HaystackInstanceValidationError extends HaystackError {}

/**
 * Thrown when the provider returns `null`, when the output is not explicitly declared to be `.nullable()`.
 */
export class HaystackNullResponseError extends HaystackInstanceValidationError {
    public readonly outputId: GenericHaystackId;
    public constructor(outputId: HaystackNullResponseError['outputId']) {
        super(
            `Null value returned for non-nullable provider: ${stringifyId(
                outputId
            )}`
        );
        this.name = 'HaystackNullResponseError';
        this.outputId = outputId;
    }
}

/**
 * Thrown when the provider returns `undefined`, when the output is not explicitly declared to be `.undefinable()`.
 */
export class HaystackUndefinedResponseError extends HaystackInstanceValidationError {
    public readonly outputId: GenericHaystackId;
    public constructor(outputId: HaystackUndefinedResponseError['outputId']) {
        super(
            `Undefined value returned for non-undefinable provider: ${stringifyId(
                outputId
            )}`
        );
        this.name = 'HaystackUndefinedResponseError';
        this.outputId = outputId;
    }
}

/**
 * Thrown when the provider returns an instance that is not an `instanceof` the declared output.
 */
export class HaystackInstanceOfResponseError extends HaystackInstanceValidationError {
    public readonly outputId: GenericHaystackId;
    public readonly value: unknown;
    public constructor(outputId: GenericHaystackId, value: unknown) {
        super(
            `Value ${HaystackInstanceOfResponseError.#stringify(
                value
            )} returned by provider is not instance of class: ${stringifyId(
                outputId
            )}`
        );
        this.name = 'HaystackInstanceOfResponseError';
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
 * that are `HaystackInstanceValidationError`.
 *
 * Will always contain >1 `causes`, which are never themselves `HaystackMultiError`s.
 */
export class HaystackMultiError extends HaystackInstanceValidationError {
    public readonly causes: unknown[];

    public constructor(errors: unknown[]) {
        const causes = errors.flatMap(err =>
            err instanceof HaystackMultiError ? err.causes : [err]
        );
        super(
            `Multiple errors: [${causes
                .map(err => (err instanceof Error ? err.message : err))
                .join(', ')}]`,
            { cause: causes[0] }
        );
        this.name = 'HaystackMultiError';
        this.causes = causes;
    }

    public static validateAllSettled<T>(
        settled: PromiseSettledResult<T>[]
    ): asserts settled is PromiseFulfilledResult<T>[] {
        const rejected = settled.filter(
            (settle): settle is PromiseRejectedResult =>
                settle.status === 'rejected'
        );
        if (rejected.length > 0) {
            throw rejected.length === 1
                ? rejected[0]!.reason
                : new HaystackMultiError(
                      rejected.map(err => err.reason as unknown)
                  );
        }
    }
}
