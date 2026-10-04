// eslint-disable-next-line import/no-unassigned-import, import/order -- registers DOM globals, so must load before `react-dom`
import './dom.js';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';

export { renderHook, waitFor } from '@testing-library/react';

export type Wrapper = (props: { children: ReactNode }) => ReactNode;

/**
 * Provides the client to hooks, and catches any hook that suspends.
 *
 * While suspended, `renderHook`'s `result.current` stays `null`.
 *
 * @param client - query client to provide
 * @returns wrapper component for `renderHook`
 */
export const createWrapper = (client: QueryClient): Wrapper => {
    const wrapper: Wrapper = ({ children }) => (
        <QueryClientProvider client={client}>
            <Suspense fallback={null}>{children}</Suspense>
        </QueryClientProvider>
    );
    return wrapper;
};
