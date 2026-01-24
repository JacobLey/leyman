import type { WrapperComponent } from '@testing-library/react-hooks';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-hooks';
import { expect } from 'chai';
import { spy, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { mutation } from 'normalized-react-query';
import * as Api from '../data/api.js';

suite('useMutation', () => {
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

    context.test('success', async ({ wrapper }) => {
        const mutateUser = mutation<Api.User, string, { age: number }>({
            getKey(id) {
                return ['users', id];
            },
            async mutationFn(id, body) {
                if (body.age < 0) {
                    throw new Error('Age must be >= 0');
                }
                return Api.updateUser(id, body);
            },
        });

        const { result, rerender } = renderHook(({ id }) => mutateUser.useMutation(id), {
            wrapper,
            initialProps: { id: 'abc' },
        });

        expect(result.current.isIdle).to.equal(true);
        const user = await result.current.mutateAsync({ age: 42 });
        expect(user).to.contain({ id: 'abc', age: 42 });

        rerender();
        expect(result.current.isSuccess).to.equal(true);
        expect(result.current.data).to.eq(user);

        let error: unknown;
        try {
            await result.current.mutateAsync({ age: -1 });
        } catch (err) {
            error = err;
        }
        expect(error).to.haveOwnProperty('message', 'Age must be >= 0');
    });

    context.test('onSuccess', async ({ wrapper }) => {
        const onSuccess = spy();
        const onSettled = spy();

        const mutateUser = mutation<Api.User, string, { age: number }>(
            {
                getKey(id) {
                    return ['users', id];
                },
                async mutationFn(id, body) {
                    return Api.updateUser(id, body);
                },
            },
            {
                onSuccess,
                onSettled,
            }
        );

        const { result } = renderHook(({ id }) => mutateUser.useMutation(id), {
            wrapper,
            initialProps: { id: 'abc' },
        });

        await result.current.mutateAsync({ age: 42 });

        expect(onSuccess.calledOnce).to.equal(true);
        expect(onSettled.calledOnce).to.equal(true);
    });

    context.test('onError', async ({ wrapper }) => {
        const onError = spy();
        const onSettled = spy();

        const mutateUser = mutation<Api.User, string, { age: number }>(
            {
                getKey(id) {
                    return ['users', id];
                },
                async mutationFn() {
                    throw new Error('Invalid body');
                },
            },
            {
                onError,
                onSettled,
            }
        );

        const { result, rerender } = renderHook(({ id }) => mutateUser.useMutation(id), {
            wrapper,
            initialProps: { id: 'abc' },
        });

        expect(result.current.isIdle).to.equal(true);

        let error: unknown;
        try {
            await result.current.mutateAsync({ age: -1 });
        } catch (err) {
            error = err;
        }
        expect(error).to.haveOwnProperty('message', 'Invalid body');

        rerender();

        expect(result.current.isError).to.equal(true);
        expect(result.current.error).to.haveOwnProperty('message', 'Invalid body');

        expect(onError.calledOnce).to.equal(true);
        expect(onSettled.calledOnce).to.equal(true);
    });
});
