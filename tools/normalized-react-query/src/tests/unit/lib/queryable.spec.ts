import { CancelledError, QueryClient } from '@tanstack/react-query';
import { expect, expectAsync } from 'bupkis';
import { beforeEach, suite } from 'mocha-chain';
import { resource } from 'normalized-react-query';

suite('queryable', () => {
    const context = beforeEach(() => {
        const client = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: Infinity,
                },
            },
        });
        return {
            client,
        };
    });

    suite('refetchQuery', () => {
        context.test('Refetches', async ({ client }) => {
            let count = 0;
            const fetchableResource = resource<void, number>({
                key: ['key'],
                queryFn: () => {
                    count++;
                    return count;
                },
            });

            let fetched = await fetchableResource.fetchQuery(client);
            expect(fetched, 'to equal', 1);

            fetched = await fetchableResource.fetchQuery(client);
            expect(fetched, 'to equal', 1);

            await fetchableResource.refetchQuery(client);

            fetched = await fetchableResource.fetchQuery(client);
            expect(fetched, 'to equal', 2);
        });

        context.test('Will not perform original fetch', async ({ client }) => {
            const fetchableResource = resource({
                key: (val: string) => ['key', val],
                queryFn: () => {
                    throw new Error('Will not run');
                },
            });

            await fetchableResource.refetchQuery(client, 'abc');

            expect(fetchableResource.hasState(client, 'abc'), 'to be false');
        });
    });

    suite('cancelQuery', () => {
        context.test('Aborts in flight', async ({ client }) => {
            const abortableResource = resource({
                key: ['key'],
                queryFn: ({ signal }) => {
                    let aborted = false;
                    signal.addEventListener(
                        'abort',
                        () => {
                            aborted = true;
                        },
                        { once: true }
                    );
                    return aborted;
                },
            });

            const fetching = abortableResource.fetchQuery(client, {});

            await abortableResource.cancelQuery(client, []);

            await expectAsync(fetching, 'to reject with a', CancelledError);

            const queryState = abortableResource.getQueryState(client, true);
            expect(queryState, 'not to be undefined');
            expect(queryState!.data, 'to be undefined');

            const refetched = await abortableResource.fetchQuery(client, {});
            expect(refetched, 'to equal', false);
        });
    });

    suite('removeQuery', () => {
        const removableResource = resource({
            key: (num: number) => [num],
            queryFn: ({ params }) => params * 2,
        });

        context.test('Removes', async ({ client }) => {
            removableResource.populate(client, 1, 2);
            expect(removableResource.hasData(client, 1), 'to be true');

            removableResource.removeQuery(client, 1);

            expect(removableResource.hasState(client, 1), 'to be false');
        });

        context.test('Noop if not exists', async ({ client }) => {
            removableResource.removeQuery(client, 1);

            expect(removableResource.hasState(client, 1), 'to be false');
        });
    });

    suite('resetQuery', () => {
        const resettableContext = context.beforeEach(() => {
            let count = 0;

            const resettableResource = resource({
                key: (input: [number, string]) => input,
                queryFn: ({ params: [num, str] }) => {
                    count++;
                    return `${str}:${num + count}`;
                },
            });
            return { resettableResource };
        });

        resettableContext.test('Resets', async ({ client, resettableResource }) => {
            const prefetching = resettableResource.prefetchQuery(client, [1, 'a']);

            await resettableResource.resetQuery(client, [1, 'a']);

            await prefetching;

            expect(resettableResource.hasState(client, [1, 'a']), 'to be true');
            expect(resettableResource.hasData(client, [1, 'a']), 'to be false');

            const updated = await resettableResource.fetchQuery(client, [1, 'a']);
            expect(updated, 'to equal', 'a:3');
        });

        resettableContext.test('Noop if not exists', async ({ client, resettableResource }) => {
            await resettableResource.resetQuery(client, [2, 'b']);

            expect(resettableResource.hasState(client, [2, 'b']), 'to be false');
        });
    });
});
