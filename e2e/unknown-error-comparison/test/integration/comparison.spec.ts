import { runInNewContext } from 'node:vm';
import ensureError from 'ensure-error';
import normalizeException from 'normalize-exception';
import { messageWithCauses } from 'pony-cause';
import { deserializeError } from 'serialize-error';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { getErrorMessage, toError, walkErrors } from 'unknown-error';

/**
 * What a library offers for each kind of check. A library without one is left out of those checks
 * (shown as "—" in the comparison table).
 */
interface Library {
    /**
     * Converts a caught value to an Error.
     */
    readonly normalize?: (value: unknown) => Error;
    /**
     * Reads the message of a caught value. Defaults to `normalize(value).message`.
     */
    readonly message?: (value: unknown) => string;
    /**
     * Messages of the value and everything nested in it (its causes and `AggregateError` entries).
     */
    readonly chain?: (value: unknown) => readonly string[];
}

/**
 * Collects the messages of a tree that a library has already normalized.
 *
 * A node the library left as a non-Error is recorded as `<non-error>`, which fails the checks.
 * `Error.isError` rather than `instanceof`, so a library isn't blamed for keeping an Error from
 * another realm as it is.
 *
 * @param root - normalized error
 * @returns one message per node
 */
const messagesOf = (root: unknown): string[] => {
    const messages: string[] = [];
    const seen = new Set<unknown>();
    const pending: unknown[] = [root];
    while (pending.length > 0) {
        const next = pending.pop();
        if (seen.has(next)) {
            continue;
        }
        seen.add(next);
        if (Error.isError(next)) {
            messages.push(next.message);
            const { errors } = next as { errors?: unknown };
            if (Array.isArray(errors)) {
                pending.push(...(errors as unknown[]).toReversed());
            }
            if (next.cause !== undefined) {
                pending.push(next.cause);
            }
        } else {
            messages.push('<non-error>');
        }
    }
    return messages;
};

/**
 * The conversion most codebases write by hand.
 *
 * @param value - caught value
 * @returns an Error
 */
const handWritten = (value: unknown): Error =>
    // eslint-disable-next-line unicorn/prefer-error-is-error -- what most codebases use
    value instanceof Error ? value : new Error(String(value));

const libraries = {
    'unknown-error': {
        normalize: toError,
        message: getErrorMessage,
        chain: value => [...walkErrors(value)].map(({ error }) => error.message),
    },
    'hand-written': {
        normalize: handWritten,
    },
    'ensure-error': {
        normalize: ensureError,
        chain: value => messagesOf(ensureError(value)),
    },
    'normalize-exception': {
        normalize: normalizeException,
        chain: value => messagesOf(normalizeException(value)),
    },
    'serialize-error': {
        normalize: deserializeError,
    },
    'pony-cause': {
        // Only formats an existing Error's cause chain, as one `outer: inner` string
        chain: value => [messageWithCauses(value as Error)],
    },
} as const satisfies Record<string, Library>;

type LibraryName = keyof typeof libraries;

type Outcome = 'fail' | 'pass' | 'throws';

interface Case {
    readonly name: string;
    readonly needs: 'chain' | 'normalize';
    /**
     * Whether the library handles the case. Throwing counts as its own outcome.
     */
    readonly check: (library: Required<Library>) => boolean;
    /**
     * What each library does today. Libraries without what the case `needs` are left out.
     */
    readonly expected: Partial<Record<LibraryName, Outcome>>;
}

const realmError = (): unknown => runInNewContext('new TypeError("x")');

const hostileProxy = (): object =>
    new Proxy(
        {},
        Object.fromEntries(
            (
                [
                    'defineProperty',
                    'get',
                    'getOwnPropertyDescriptor',
                    'getPrototypeOf',
                    'has',
                    'ownKeys',
                    'set',
                ] as const
            ).map(trap => [
                trap,
                () => {
                    throw new Error(`hostile ${trap}`);
                },
            ])
        )
    );

const cases: readonly Case[] = [
    {
        name: 'Uses a thrown string as the message, unchanged',
        needs: 'normalize',
        check: ({ normalize }) => normalize('boom').message === 'boom',
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'pass',
            // Quotes it: 'boom'
            'ensure-error': 'fail',
            'normalize-exception': 'pass',
            // Prefixes it: Non-error value: boom
            'serialize-error': 'fail',
        },
    },
    {
        name: 'Converts a thrown null',
        needs: 'normalize',
        check: ({ normalize }) => Error.isError(normalize(null)),
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'pass',
            'ensure-error': 'pass',
            'normalize-exception': 'pass',
            'serialize-error': 'pass',
        },
    },
    {
        name: 'Keeps an Error from another realm',
        needs: 'normalize',
        check: ({ normalize }) => {
            const error = realmError() as Error;
            const result = normalize(error);
            return (
                result.name === 'TypeError' &&
                result.message === 'x' &&
                result.stack === error.stack
            );
        },
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'fail',
            'ensure-error': 'fail',
            'normalize-exception': 'pass',
            'serialize-error': 'pass',
        },
    },
    {
        name: 'Rebuilds an error-like object with its name, message, code and stack',
        needs: 'normalize',
        check: ({ normalize }) => {
            const result = normalize({
                name: 'TypeError',
                message: 'm',
                code: 'E_CODE',
                stack: 'TypeError: m\n    at original (file.js:1:1)',
            });
            return (
                result.name === 'TypeError' &&
                result.message === 'm' &&
                (result as { code?: unknown }).code === 'E_CODE' &&
                result.stack?.includes('original') === true
            );
        },
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'fail',
            'ensure-error': 'fail',
            'normalize-exception': 'pass',
            'serialize-error': 'pass',
        },
    },
    {
        name: 'Describes a circular object',
        needs: 'normalize',
        check: ({ message }) => {
            const value: Record<string, unknown> = { id: 7 };
            value.self = value;
            return message(value).includes('"id":7');
        },
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'fail',
            'ensure-error': 'fail',
            'normalize-exception': 'fail',
            'serialize-error': 'fail',
        },
    },
    {
        name: 'Describes an object containing a BigInt',
        needs: 'normalize',
        check: ({ message }) => message({ count: 1n }).includes('1n'),
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'fail',
            'ensure-error': 'fail',
            'normalize-exception': 'fail',
            'serialize-error': 'fail',
        },
    },
    {
        name: 'Converts an object whose toJSON and toString throw',
        needs: 'normalize',
        check: ({ normalize }) =>
            Error.isError(
                normalize({
                    toJSON: () => {
                        throw new Error('toJSON');
                    },
                    toString: () => {
                        throw new Error('toString');
                    },
                })
            ),
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'throws',
            'ensure-error': 'pass',
            'normalize-exception': 'pass',
            'serialize-error': 'pass',
        },
    },
    {
        name: 'Converts a Proxy that throws from every trap',
        needs: 'normalize',
        check: ({ normalize }) => Error.isError(normalize(hostileProxy())),
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'throws',
            'ensure-error': 'throws',
            'normalize-exception': 'pass',
            'serialize-error': 'throws',
        },
    },
    {
        name: 'Reads the message of an Error whose message getter throws',
        needs: 'normalize',
        check: ({ message }) => {
            const error = Object.defineProperty(new Error('x'), 'message', {
                get: () => {
                    throw new Error('getter');
                },
            });
            return typeof message(error) === 'string';
        },
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'throws',
            'ensure-error': 'throws',
            'normalize-exception': 'pass',
            'serialize-error': 'throws',
        },
    },
    {
        name: 'Leaves the Error passed in unmodified',
        needs: 'normalize',
        check: ({ normalize }) => {
            const error = new Error('x', { cause: 'not an error' });
            normalize(error);
            return error.cause === 'not an error';
        },
        expected: {
            'unknown-error': 'pass',
            'hand-written': 'pass',
            // Both replace the cause with an Error, in place
            'ensure-error': 'fail',
            'normalize-exception': 'fail',
            'serialize-error': 'pass',
        },
    },
    {
        name: 'Includes a cause that is not an Error',
        needs: 'chain',
        check: ({ chain }) =>
            chain(new Error('top', { cause: 'inner' }))
                .join('\n')
                .includes('inner'),
        expected: {
            'unknown-error': 'pass',
            'ensure-error': 'pass',
            'normalize-exception': 'pass',
            'pony-cause': 'fail',
        },
    },
    {
        name: 'Includes a cause from another realm',
        needs: 'chain',
        check: ({ chain }) => {
            const messages = chain(new Error('top', { cause: realmError() }));
            return messages.includes('x') || messages.some(message => message.endsWith(': x'));
        },
        expected: {
            'unknown-error': 'pass',
            // Wraps it in a NonError with the message {}
            'ensure-error': 'fail',
            'normalize-exception': 'pass',
            'pony-cause': 'fail',
        },
    },
    {
        name: 'Ends a circular cause chain',
        needs: 'chain',
        check: ({ chain }) => {
            const a = new Error('a');
            // Writable, like an assigned cause: ensure-error throws when it can't replace one
            Object.defineProperty(a, 'cause', {
                configurable: true,
                value: new Error('b', { cause: a }),
                writable: true,
            });
            const messages = chain(a).join('\n');
            return messages.includes('a') && messages.includes('b');
        },
        expected: {
            'unknown-error': 'pass',
            'ensure-error': 'pass',
            'normalize-exception': 'pass',
            'pony-cause': 'pass',
        },
    },
    {
        name: 'Includes nested AggregateError entries',
        needs: 'chain',
        check: ({ chain }) => {
            const messages = chain(
                new AggregateError(
                    [new Error('c1'), 'c2', new AggregateError([new Error('c3')], 'inner')],
                    'all'
                )
            ).join('\n');
            return ['c1', 'c2', 'c3'].every(message => messages.includes(message));
        },
        expected: {
            'unknown-error': 'pass',
            'ensure-error': 'pass',
            'normalize-exception': 'pass',
            'pony-cause': 'fail',
        },
    },
    {
        name: 'Handles a 10,000-deep cause chain',
        needs: 'chain',
        check: ({ chain }) => {
            let error = new Error('leaf');
            for (let i = 0; i < 10_000; i++) {
                error = new Error(`e${i}`, { cause: error });
            }
            // Mocha raises the limit to Infinity. ensure-error creates an Error at every level of
            // the chain, so with no limit each captures a stack as deep as the recursion so far,
            // which takes seconds before it overflows. Node's default keeps the outcome the same.
            /* eslint-disable unicorn/no-nonstandard-builtin-properties -- V8's limit is the subject */
            const { stackTraceLimit } = Error;
            Error.stackTraceLimit = 10;
            try {
                return chain(error).length > 0;
            } finally {
                Error.stackTraceLimit = stackTraceLimit;
            }
            /* eslint-enable unicorn/no-nonstandard-builtin-properties */
        },
        expected: {
            // Stops at maxDepth (32 by default), and marks where it stopped
            'unknown-error': 'pass',
            // The rest recurse, and overflow the call stack
            'ensure-error': 'throws',
            'normalize-exception': 'throws',
            'pony-cause': 'throws',
        },
    },
];

/**
 * Runs a case against a library.
 *
 * @param testCase - case to run
 * @param library - library to run it against
 * @returns the outcome
 */
const run = (testCase: Case, library: Library): Outcome => {
    const normalize = library.normalize ?? toError;
    const complete: Required<Library> = {
        normalize,
        message: library.message ?? (value => normalize(value).message),
        chain: library.chain ?? (() => []),
    };
    try {
        return testCase.check(complete) ? 'pass' : 'fail';
    } catch {
        return 'throws';
    }
};

suite('Comparison with other libraries', () => {
    for (const testCase of cases) {
        suite(testCase.name, () => {
            for (const [name, outcome] of Object.entries(testCase.expected)) {
                test(`${name}: ${outcome}`, () => {
                    expect(run(testCase, libraries[name as LibraryName])).to.equal(outcome);
                });
            }
        });
    }

    test('Every library with what a case needs has an expected outcome', () => {
        expect(
            cases.map(({ name, expected }) => ({
                name,
                libraries: Object.keys(expected).toSorted((a, b) => a.localeCompare(b)),
            }))
        ).to.deep.equal(
            cases.map(({ name, needs }) => ({
                name,
                libraries: Object.entries(libraries)
                    .filter(([, library]) => (library as Library)[needs] !== undefined)
                    .map(([libraryName]) => libraryName)
                    .toSorted((a, b) => a.localeCompare(b)),
            }))
        );
    });
});
