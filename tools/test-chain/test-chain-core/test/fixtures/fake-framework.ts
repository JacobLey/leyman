import type { ChainFramework, NativeMethod, NativeMethodWithModifiers } from 'test-chain-core';

/**
 * Identity of a test in the fake framework.
 */
export interface FakeKey {
    name: string;
}

export interface Registration {
    method: string;
    title: string | undefined;
    fn: NativeMethod;
}

export interface FakeFramework {
    framework: ChainFramework<FakeKey>;
    registrations: Registration[];
    /**
     * Find the (only) registration with the provided title.
     */
    find: (title: string) => Registration;
    /**
     * Execute a registered callback as the framework would, for the provided test.
     */
    run: (title: string, key?: FakeKey, ...args: unknown[]) => unknown;
    /**
     * Execute a registered `done`-style callback, resolving with whatever `done` was called with.
     */
    runWithDone: (title: string, key?: FakeKey) => Promise<unknown>;
}

/**
 * Minimal test framework, that records registrations rather than executing them.
 *
 * Tests then drive execution manually, which allows asserting on ordering and failure behavior
 * independent of any real framework.
 *
 * @param options - framework capabilities
 * @param options.supportsDone - whether `done` callbacks are supported
 * @param options.allowAsyncSuites - whether suite callbacks may be async
 * @returns framework description, plus helpers to inspect and execute registrations
 */
export const createFakeFramework = ({
    supportsDone = true,
    allowAsyncSuites = false,
}: {
    supportsDone?: boolean;
    allowAsyncSuites?: boolean;
} = {}): FakeFramework => {
    const registrations: Registration[] = [];

    const record =
        (method: string): NativeMethod =>
        (...args: unknown[]) => {
            const fn = args.pop() as NativeMethod;
            const registration = { title: args[0] as string | undefined, method, fn };
            registrations.push(registration);
            return registration;
        };
    const withModifiers = (method: string, native: NativeMethod): NativeMethodWithModifiers =>
        Object.assign(native, {
            only: record(`${method}.only`),
            skip: record(`${method}.skip`),
        });

    const suite: NativeMethod = (title: string, cb: () => unknown) => {
        registrations.push({ method: 'suite', fn: cb, title });
        return cb.call({ suite: title });
    };

    const find = (title: string): Registration => {
        const matches = registrations.filter(registration => registration.title === title);
        if (matches.length !== 1) {
            throw new Error(`Expected exactly one registration titled ${title}`);
        }
        return matches[0]!;
    };

    const defaultKey: FakeKey = { name: '<default>' };

    return {
        registrations,
        find,
        framework: {
            supportsDone,
            allowAsyncSuites,
            methods: {
                suite: withModifiers('suite', suite),
                before: record('before'),
                beforeEach: record('beforeEach'),
                test: withModifiers('test', record('test')),
                afterEach: record('afterEach'),
                after: record('after'),
            },
            currentTest: {
                inHook: thisArg => (thisArg as { currentTest: FakeKey }).currentTest,
                inTest: thisArg => (thisArg as { test: FakeKey }).test,
            },
            names: {
                before: ['before', 'beforeAll'],
                beforeEach: ['beforeEach'],
                test: ['test', 'it'],
                skipTest: ['xit'],
                afterEach: ['afterEach'],
                after: ['after', 'afterAll'],
            },
        },
        run: (title, key = defaultKey, ...args) =>
            find(title).fn.call({ currentTest: key, test: key }, ...args),
        runWithDone: async (title, key = defaultKey) =>
            new Promise(resolve => {
                find(title).fn.call({ currentTest: key, test: key }, resolve);
            }),
    };
};
