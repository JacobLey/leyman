import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, type WrapperComponent } from '@testing-library/react-hooks';
import { expect } from 'chai';
import type { ReactNode } from 'react';
import { spy, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-hookup';
import { resource } from '../../resource.js';
import * as Api from '../data/api.js';

suite('resourece', () => {
    const context = beforeEach(
        (): {
            client: QueryClient;
            wrapper: WrapperComponent<{
                id: string;
                children?: ReactNode;
            }>;
        } => {
            const client = new QueryClient({
                logger: {
                    error() {},
                    log() {},
                    warn() {},
                },
            });
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

    suite('useQuery', () => {
        context.test('success', async ({ client, wrapper }) => {
            const fetchUser = resource<Api.User, string>({
                getKey(id) {
                    return ['users', id];
                },
                async queryFn(id) {
                    return Api.getUser(id);
                },
            });

            const { result, rerender } = renderHook(({ id }) => fetchUser.useQuery(id), {
                wrapper,
                initialProps: { id: 'abc' },
            });

            expect(result.current.data).to.equal(undefined);
            expect(result.current.isLoading).to.equal(true);

            while (fetchUser.getStatus(client, 'abc') === 'loading') {
                await Api.delayImmediate();
            }
            rerender();

            expect(result.current.isSuccess).to.equal(true);
            expect(result.current.data).to.contain({ id: 'abc' });
        });

        context.test('onSuccess', async ({ wrapper }) => {
            const onSuccess = spy();
            const onSettled = spy();

            const fetchUser = resource<Api.User, string>(
                {
                    getKey(id) {
                        return ['users', id];
                    },
                    async queryFn(id) {
                        return Api.getUser(id);
                    },
                },
                {
                    onSuccess,
                    onSettled,
                }
            );

            const { result, rerender } = renderHook(({ id }) => fetchUser.useQuery(id), {
                wrapper,
                initialProps: { id: 'abc' },
            });

            while (!onSuccess.calledOnce) {
                await Api.delayImmediate();
            }
            rerender();

            expect(result.current.isSuccess).to.equal(true);
            expect(result.current.data).to.contain({ id: 'abc' });
            expect(onSettled.calledOnce).to.equal(true);
        });

        context.test('onError', async ({ wrapper }) => {
            const onError = spy();
            const onSettled = spy();

            const fetchUser = resource<Api.User, string>(
                {
                    getKey(id) {
                        return ['users', id];
                    },
                    async queryFn(id) {
                        throw new Error(`Invalid id: ${id}`);
                    },
                },
                {
                    onError,
                    onSettled,
                }
            );

            const { result, rerender } = renderHook(
                ({ id }) => fetchUser.useQuery(id, { retry: false }),
                {
                    wrapper,
                    initialProps: { id: 'abc' },
                }
            );

            while (!onError.calledOnce) {
                await Api.delayImmediate();
            }
            rerender();

            expect(result.current.isError).to.equal(true);
            expect(result.current.data).to.equal(undefined);
            expect(result.current.error).to.haveOwnProperty('message', 'Invalid id: abc');
            expect(onSettled.calledOnce).to.equal(true);
        });
    });

    suite('fetch', () => {
        context.test('success', async ({ client }) => {
            const onSuccess = spy();
            const onSettled = spy();

            const fetchUser = resource<Api.User, string>(
                {
                    getKey(id) {
                        return ['users', id];
                    },
                    async queryFn(id) {
                        if (id === 'xyz') {
                            throw new Error(`Invalid id: ${id}`);
                        }
                        return Api.getUser(id);
                    },
                },
                {
                    onSuccess,
                    onSettled,
                }
            );

            const user = await fetchUser.fetch(client, 'abc');
            expect(user).to.contain({ id: 'abc' });

            expect([onSuccess.callCount, onSettled.callCount]).to.deep.equal([1, 1]);

            const cachedUser = await fetchUser.fetch(client, 'abc', {
                staleTime: Number.POSITIVE_INFINITY,
            });
            expect(user).to.eq(cachedUser);

            expect([onSuccess.callCount, onSettled.callCount]).to.deep.equal([1, 1]);

            let error: unknown;
            try {
                await fetchUser.fetch(client, 'xyz');
            } catch (err) {
                error = err;
            }
            expect(error).to.haveOwnProperty('message', 'Invalid id: xyz');

            expect([onSuccess.callCount, onSettled.callCount]).to.deep.equal([1, 2]);
        });

        context.test('onError', async ({ client }) => {
            const onError = spy();

            const fetchUser = resource<Api.User, string>(
                {
                    getKey(id) {
                        return ['users', id];
                    },
                    async queryFn(id) {
                        throw new Error(`Invalid id: ${id}`);
                    },
                },
                {
                    onError,
                }
            );

            let error: unknown;
            try {
                await fetchUser.fetch(client, 'xyz');
            } catch (err) {
                error = err;
            }
            expect(error).to.haveOwnProperty('message', 'Invalid id: xyz');

            expect(onError.callCount).to.equal(1);

            try {
                error = null;
                await fetchUser.fetch(client, 'xyz');
            } catch (err) {
                error = err;
            }
            expect(error).to.haveOwnProperty('message', 'Invalid id: xyz');

            expect(onError.callCount).to.equal(2);
        });
    });

    context.test('getData', async ({ client }) => {
        const onSuccess = spy();
        const onSettled = spy();

        const fetchSum = resource<number, [number, number]>(
            {
                getKey([a, b]) {
                    return ['sum', a, b];
                },
                async queryFn([a, b]) {
                    return a + b;
                },
            },
            {
                onSuccess,
                onSettled,
            }
        );

        expect(fetchSum.getStatus(client, [1, 2])).to.equal(null);

        await fetchSum.setData(client, [1, 2], 4);
        expect([onSuccess.callCount, onSettled.callCount]).to.deep.equal([1, 1]);

        expect(fetchSum.getStatus(client, [1, 2])).to.equal('success');

        await fetchSum.fetch(client, [1, 2], {
            staleTime: Number.POSITIVE_INFINITY,
        });
        expect([onSuccess.callCount, onSettled.callCount]).to.deep.equal([1, 1]);

        await fetchSum.setData(client, [3, 4], 10, {
            skipHooks: true,
        });
        expect([onSuccess.callCount, onSettled.callCount]).to.deep.equal([1, 1]);

        expect(fetchSum.getData(client, [1, 2])).to.equal(4);
        expect(fetchSum.getData(client, [2, 3])).to.equal(undefined);

        await fetchSum.invalidate(client, [1, 2]);
        expect(fetchSum.getData(client, [1, 2])).to.equal(4);

        await fetchSum.fetch(client, [1, 2]);
        expect(fetchSum.getData(client, [1, 2])).to.equal(3);

        await fetchSum.reset(client, [3, 4]);
        expect(fetchSum.getData(client, [3, 4])).to.equal(undefined);
    });
});
