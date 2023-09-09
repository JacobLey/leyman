import type { GenericHaystackId } from '#identifier';

export class HaystackError extends Error {}

const stringifyId = (id: GenericHaystackId) => {
    let text = id.id;
    const { annotations } = id;
    const annotationsText = [
        annotations.named === null ? null : `named: ${String(annotations.named)}` as const,
        annotations.nullable && 'nullable' as const,
        annotations.undefinable && 'undefinable' as const,
        annotations.supplier && `supplier(${[
            annotations.supplier.sync ? 'sync' : 'async',
            annotations.supplier.propagateScope && 'propagating'
        ].filter(x => x).join(', ')})` as const,
        annotations.lateBinding && 'late-binding' as const
    ].filter(x => x);
    if (annotationsText.length > 0) {
        text += `(${annotationsText.join(', ')})`
    }
    return text;
};
const stringifyIds = (ids: GenericHaystackId[]) => ids.map(id => stringifyId(id)).sort().join(', ');

export class HaystackModuleValidationError extends HaystackError {}

export class HaystackDuplicateOutputError extends HaystackModuleValidationError {

    constructor(
        public readonly outputIds: GenericHaystackId[]
    ) {
        super(`Duplicate output identifier for module: ${stringifyIds(outputIds)}`);
    }
}

export class HaystackContainerValidationError extends HaystackError {}

export class HaystackCircularDependencyError extends HaystackContainerValidationError {

    static #uniqueChains(circularChains: GenericHaystackId[][]): Set<GenericHaystackId>[] {
        const uniqueChains: Set<GenericHaystackId>[] = [];
        for (const circularChain of circularChains) {
            const circularSet = new Set(circularChain);
            if (uniqueChains.every(uniqueChain => {
                if (uniqueChain.size !== circularSet.size) {
                    return true;
                }
                for (const id of circularSet) {
                    if (!uniqueChain.has(id)) {
                        return true;
                    }
                }
                return false;
            })) {
                uniqueChains.push(circularSet);
            }
        }
        return uniqueChains;
    }

    static #sortChains(chains: Set<GenericHaystackId>[]): {
        chain: GenericHaystackId[],
        message: string;
    }[] {

        return chains.map(chain => {
            const chainWithMessage = [...chain].map(id => ({ id, idStr: stringifyId(id) }));
            const permutations: (typeof chainWithMessage)[] = [];

            for (let i = 0; i < chainWithMessage.length; ++i) {
                permutations.push([...chainWithMessage.slice(i), ...chainWithMessage.slice(0, i)])
            }

            return permutations.map(permutation => ({
                chain: permutation.map(({ id }) => id),
                message: permutation.map(({ idStr }) => idStr).join('->'),
            })).sort(
                (a, b) => a.message.localeCompare(b.message)
            )[0]!;
        }).sort(
            (a, b) => a.message.localeCompare(b.message)
        );
    }

    public readonly circularChains: GenericHaystackId[][];
    constructor(
        circularChains: GenericHaystackId[][]
    ) {
        const uniqueChains = HaystackCircularDependencyError.#uniqueChains(circularChains);
        const sortedChains = HaystackCircularDependencyError.#sortChains(uniqueChains);
        super(`Circular dependencies detected in container: ${sortedChains.map(({ message }) => message).join(', ')}`);
        this.circularChains = sortedChains.map(({ chain }) => chain);
    }
}

export class HaystackSyncSupplierError extends HaystackContainerValidationError {

    constructor(
        public readonly unsafeSupplierBindings: {
            bindingOutputId: GenericHaystackId;
            supplierId: GenericHaystackId;
        }[]
    ) {
        const bindingToMessage = new Map(
            unsafeSupplierBindings.map(unsafeBinding => [
                unsafeBinding,
                `[output id: ${
                    stringifyId(unsafeBinding.bindingOutputId)
                }, dependency supplier id: ${
                    stringifyId(unsafeBinding.supplierId)
                }]`
            ])
        );
        unsafeSupplierBindings.sort(
            (a, b) => bindingToMessage.get(a)!.localeCompare(bindingToMessage.get(b)!)
        );
        super(`Binding has dependency on syncronous supplier that must be async: ${
            unsafeSupplierBindings.map(unsafeBinding => bindingToMessage.get(unsafeBinding)!).join(', ')
        }`);
    }
}

export class HaystackProviderMissingError extends HaystackContainerValidationError {

    constructor(
        public readonly dependencyIds: GenericHaystackId[]
    ) {
        super(`Providers missing for container: ${stringifyIds(dependencyIds)}`);
    }
}

export class HaystackInstanceValidationError extends HaystackError {}

export class HaystackNullResponseError extends HaystackInstanceValidationError {

    constructor(
        public readonly outputId: GenericHaystackId
    ) {
        super(`Null value returned for non-nullable provider: ${stringifyId(outputId)}`);
    }
}

export class HaystackUndefinedResponseError extends HaystackInstanceValidationError {

    constructor(
        public readonly outputId: GenericHaystackId
    ) {
        super(`Undefined value returned for non-undefinable provider: ${stringifyId(outputId)}`);
    }
}

export class HaystackInstanceOfResponseError extends HaystackInstanceValidationError {

    static #stringify(value: unknown): unknown {
        if (value && typeof value === 'object') {
            const { constructor } = value;
            if (constructor) {
                return constructor.name;
            } else {
                return 'without construcor'
            }
        }
        return JSON.stringify(value);
    }

    constructor(
        public readonly outputId: GenericHaystackId,
        public readonly value: unknown
    ) {
        super(`Value ${
            HaystackInstanceOfResponseError.#stringify(value)
        } returned by provider is not instance of class: ${stringifyId(outputId)}`);
    }
}

export class HaystackMultiError extends HaystackInstanceValidationError {

    declare public causes: unknown[];

    constructor(
        errors: unknown[]
    ) {
        const cause = errors.flatMap(err => err instanceof HaystackMultiError ? err.causes : [err]);
        super(`Multiple errors: [${cause.map(
            err => err instanceof Error ? err.message : err 
        ).join(', ')}]`);
        this.causes = cause;
    }

    public static validateAllSettled<T>(settled: PromiseSettledResult<T>[]): asserts settled is PromiseFulfilledResult<T>[] {
        const rejected = settled.filter((settle): settle is PromiseRejectedResult => settle.status === 'rejected');
        if (rejected.length > 0) {
            if (rejected.length === 1) {
                throw rejected[0]!.reason;
            }
            else {
                throw new HaystackMultiError(rejected.map(err => err.reason));
            }
        }
    }
}