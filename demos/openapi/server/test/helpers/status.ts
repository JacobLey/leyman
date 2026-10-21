import { expect } from '@leyman/expect';

/**
 * Asserts a response's status, and narrows the response to it, so its body has the type the spec documents for
 * that status.
 *
 * @param result - A client call's result
 * @param status - The status it should have
 * @returns The result, narrowed
 */
export const expectStatus = <
    Result extends { readonly status: number },
    Status extends Result['status'],
>(
    result: Result,
    status: Status
): Extract<Result, { readonly status: Status }> => {
    expect(result.status).to.equal(status);
    return result as Extract<Result, { readonly status: Status }>;
};
