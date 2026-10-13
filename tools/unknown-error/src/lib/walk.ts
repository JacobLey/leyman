import { hasProperty, isObject, safeGet, safeStringify } from '#safe';
import { getErrorMessage, toError } from '#to-error';

/**
 * How an error relates to the one above it in the tree.
 */
export type ErrorRelation = 'aggregate' | 'cause' | 'root';

/**
 * One error in the tree that `walkErrors` visits.
 */
export interface ErrorNode {
    /**
     * The value, converted with `toError`.
     */
    readonly error: Error;
    /**
     * Distance from the root, which is `0`.
     */
    readonly depth: number;
    /**
     * `root` for the value passed in, `cause` for an error's `cause`, `aggregate` for an entry in an
     * error's `errors` (as on `AggregateError`).
     */
    readonly relation: ErrorRelation;
    /**
     * `true` when `maxDepth` stopped the walk here, so this error's own cause and errors were skipped.
     */
    readonly truncated: boolean;
}

/**
 * Options for `walkErrors` and `formatError`.
 */
export interface WalkOptions {
    /**
     * Deepest level to visit. The root is level `0`.
     *
     * @default 32
     */
    readonly maxDepth?: number;
}

interface Pending {
    readonly value: unknown;
    readonly depth: number;
    readonly relation: ErrorRelation;
}

const DEFAULT_MAX_DEPTH = 32;
const INDENT_WIDTH = 4;

/**
 * The `cause` and `errors` entries of an error, in the order they are visited.
 *
 * @param error - parent whose `cause` and `errors` to list
 * @param depth - how far the children are from the root
 * @returns its children, cause first
 */
const childrenOf = (error: Error, depth: number): Pending[] => {
    const children: Pending[] = [];
    // `in` rather than `!== undefined`: `throw undefined` is a valid cause
    if (hasProperty(error, 'cause')) {
        children.push({ depth, relation: 'cause', value: safeGet(error, 'cause') });
    }
    const errors = safeGet(error, 'errors');
    try {
        // Copying can run Proxy traps, and `Array.isArray` throws on a revoked Proxy
        if (Array.isArray(errors)) {
            for (const value of errors as unknown[]) {
                children.push({ depth, value, relation: 'aggregate' });
            }
        }
    } catch {}
    return children;
};

/**
 * Visits an error, its `cause` chain and the `errors` of any `AggregateError`, depth first. Never
 * throws.
 *
 * Every value is converted with `toError`, so a cause that isn't an Error still appears. A value
 * already visited is skipped, so a circular chain ends.
 *
 * @param value - a caught value
 * @param options - {@link WalkOptions}
 * @yields {ErrorNode} each error in the tree, starting with `value` itself
 */
export const walkErrors = function* (
    value: unknown,
    options: WalkOptions = {}
): Generator<ErrorNode, void, undefined> {
    const { maxDepth = DEFAULT_MAX_DEPTH } = options;
    const seen = new WeakSet<object>();
    // A stack rather than recursion, so a very deep chain can't overflow the call stack
    const pending: Pending[] = [{ depth: 0, relation: 'root', value }];

    for (let next = pending.pop(); next; next = pending.pop()) {
        if (isObject(next.value)) {
            if (seen.has(next.value)) {
                continue;
            }
            seen.add(next.value);
        }
        const error = toError(next.value);
        const children = childrenOf(error, next.depth + 1);
        const isTruncated = next.depth >= maxDepth && children.length > 0;

        yield { error, depth: next.depth, relation: next.relation, truncated: isTruncated };

        if (!isTruncated) {
            // Reversed, so the first child is popped first
            pending.push(...children.toReversed());
        }
    }
};

const labels: Readonly<Record<ErrorRelation, string>> = {
    aggregate: '- ',
    cause: 'Caused by: ',
    root: '',
};

/**
 * The stack of an error, starting with its `name: message` line.
 *
 * V8 starts `stack` with that line, but Firefox and Safari don't, and a rebuilt or hand-written stack
 * may not either.
 *
 * @param error - error to describe
 * @returns its stack, or just its header when it has none
 */
const describe = (error: Error): string => {
    const name = safeGet(error, 'name');
    const message = getErrorMessage(error);
    const nameText = typeof name === 'string' ? name : safeStringify(name);
    const header = message ? `${nameText}: ${message}` : nameText;

    const stack = safeGet(error, 'stack');
    if (typeof stack !== 'string' || stack === '') {
        return header;
    }
    return stack.startsWith(header) ? stack : `${header}\n${stack}`;
};

/**
 * Formats an error with every cause and `AggregateError` entry, indented by depth. Never throws.
 *
 * Each error is printed as its stack, with causes labelled `Caused by:` and `AggregateError` entries
 * labelled `-`.
 *
 * @param value - a caught value
 * @param options - {@link WalkOptions}
 * @returns a multi-line report
 */
export const formatError = (value: unknown, options: WalkOptions = {}): string => {
    const lines: string[] = [];
    for (const { error, depth, relation, truncated } of walkErrors(value, options)) {
        const indent = ' '.repeat(INDENT_WIDTH * depth);
        const [first = '', ...rest] = describe(error).split('\n');
        lines.push(`${indent}${labels[relation]}${first}`, ...rest.map(line => indent + line));
        if (truncated) {
            lines.push(`${indent}    … more causes omitted (maxDepth: ${depth})`);
        }
    }
    return lines.join('\n');
};
