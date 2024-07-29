import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, type WrapperComponent } from '@testing-library/react-hooks';
import { expect } from 'chai';
import type { ReactNode } from 'react';
import { spy, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { type EmptyObject, infinite } from 'normalized-react-query';
import * as Api from '../data/api.js';

suite('useInfinite', () => {
    const context = beforeEach(
        (): {
            client: QueryClient;
            wrapper: WrapperComponent<{
                id: string;
                children?: ReactNode;
            }>;
        } => {
            const client = new QueryClient();
            return {
                client,
                wrapper: ({ children }) => (
                    <QueryClientProvider client={client}>{children}</QueryClientProvider>
                ),
            };
        }
    );

    afterEach(() => {
        verifyAndRestore();
    });

    context.test('success', async ({ client, wrapper }) => {
        const listUsers = infinite<Api.User, { size?: number }, number, { total: number }>({
            getKey({ nextPage, size = 3 }) {
                return ['users', { nextPage, size }];
            },
            async queryFn(params) {
                const size = params.size ?? 3;
                const users = await Api.listUsers(size);
                const nextPage = (params.nextPage ?? 0) + size;
                return {
                    data: users,
                    nextPage: nextPage < 6 ? nextPage : null,
                    total: 6,
                };
            },
        });

        const { result, rerender } = renderHook(() => listUsers.useInfinite({ size: 3 }), {
            wrapper,
        });

        expect(result.current.data).to.deep.equal([]);
        expect(result.current.isLoading).to.equal(true);

        while (
            listUsers.getStatus(client, {
                nextPage: null,
                size: 3,
            }) === 'loading'
        ) {
            await Api.delayImmediate();
        }
        rerender();

        expect(result.current.isSuccess).to.equal(true);
        expect(result.current.data.length).to.equal(3);
        expect(result.current.lastData).to.contain({
            nextPage: 3,
            total: 6,
        });
        expect(result.current.hasNextPage).to.equal(true);

        result.current.fetchNextPage();
        result.current.fetchNextPage();

        while (
            listUsers.getStatus(client, {
                nextPage: 3,
            }) === 'loading'
        ) {
            await Api.delayImmediate();
        }
        rerender();

        expect(result.current.isSuccess).to.equal(true);
        expect(result.current.data.length).to.equal(6);
        expect(result.current.hasNextPage).to.equal(false);

        result.current.fetchNextPage();

        rerender();
        expect(result.current.isSuccess).to.equal(true);
    });

    context.test('onSuccess', async ({ wrapper }) => {
        const onSuccess = spy();
        const onSettled = spy();

        const listUsers = infinite<Api.User, EmptyObject, number, { total: number }>(
            {
                getKey({ nextPage }) {
                    return ['users', { nextPage }];
                },
                async queryFn(params) {
                    const users = await Api.listUsers(3);
                    const nextPage = (params.nextPage ?? 0) + 3;
                    return {
                        data: users,
                        nextPage: nextPage < 6 ? nextPage : null,
                        total: 6,
                    };
                },
            },
            {
                onSuccess,
                onSettled,
            }
        );

        const { result, rerender } = renderHook(() => listUsers.useInfinite(), {
            wrapper,
        });

        while (!onSuccess.calledOnce) {
            await Api.delayImmediate();
        }
        rerender();

        expect(result.current.isSuccess).to.equal(true);
        expect(result.current.data.length).to.equal(3);
        expect(onSettled.calledOnce).to.equal(true);
    });

    context.test('onError', async ({ wrapper }) => {
        const onError = spy();
        const onSettled = spy();

        const listUsers = infinite<Api.User, EmptyObject, number, { total: number }>(
            {
                getKey({ nextPage }) {
                    return ['users', { nextPage }];
                },
                async queryFn() {
                    throw new Error('Invalid request');
                },
            },
            {
                onError,
                onSettled,
            }
        );

        const { result, rerender } = renderHook(
            () =>
                listUsers.useInfinite(
                    {},
                    {
                        retry: false,
                    }
                ),
            {
                wrapper,
            }
        );

        while (!onError.calledOnce) {
            await Api.delayImmediate();
        }
        rerender();

        expect(result.current.isError).to.equal(true);
        expect(result.current.data).to.deep.equal([]);
        expect(result.current.error).to.haveOwnProperty('message', 'Invalid request');
        expect(onSettled.calledOnce).to.equal(true);
    });

    context.test('getIdentifier', async ({ client, wrapper }) => {
        const listUsers = infinite<number, EmptyObject, boolean>(
            {
                getKey({ nextPage }) {
                    return ['rands', { nextPage }];
                },
                async queryFn() {
                    const rands: number[] = [];
                    for (let i = 0; i < 10; ++i) {
                        rands.push(Math.round(Math.random() * 5));
                    }
                    return {
                        data: rands,
                        nextPage: true,
                    };
                },
            },
            {
                getIdentifier: num => num,
            }
        );

        const { result, rerender } = renderHook(
            () =>
                listUsers.useInfinite(null, {
                    queryKeyHashFn: () => '<singleton>',
                }),
            {
                wrapper,
            }
        );

        while (
            listUsers.getStatus(client, {
                nextPage: null,
            }) === 'loading'
        ) {
            await Api.delayImmediate();
        }
        rerender();

        expect(result.current.isSuccess).to.equal(true);
        expect(result.current.data.length).to.be.lessThan(7);

        result.current.fetchNextPage();

        rerender();
        expect(result.current.isSuccess).to.equal(true);
    });
});
