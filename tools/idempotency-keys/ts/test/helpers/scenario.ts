import type {
    BeginResult,
    IdempotencyAttempt,
    IdempotencyKeys,
    StoredResponse,
} from 'idempotency-keys';
import type { Scenario, VectorResponse } from './vectors.js';
import { setTimeout } from 'node:timers/promises';
import { expect } from '@leyman/expect';
import { computeFingerprint, IdempotencyKeysResponseError } from 'idempotency-keys';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Converts a response of the vectors to one the store takes.
 *
 * @param response - A response as the vectors write it
 * @returns The same, with its body as bytes
 */
export const toStored = ({ status, headers, body }: VectorResponse): StoredResponse => ({
    status,
    headers,
    body: encoder.encode(body),
});

/**
 * Converts a stored response to the vectors' form, to compare.
 *
 * @param response - A stored response
 * @returns The same, as the vectors write it
 */
export const fromStored = ({ status, headers, body }: StoredResponse): VectorResponse => ({
    status,
    headers: headers.map(([name, value]) => [name, value] as const),
    body: decoder.decode(body),
});

const check = (
    result: BeginResult,
    expected: string,
    response: VectorResponse | undefined
): void => {
    expect(result.outcome).to.equal(expected);
    if (result.outcome === 'replay') {
        expect(fromStored(result.response)).to.deep.equal(response);
    }
};

/**
 * Runs a scenario's steps in order against `keys`, as the vectors' README describes, asserting every expectation.
 *
 * @param scenario - Scenario to run
 * @param keys - Built with the scenario's options, on a store of its own
 */
export const runScenario = async (scenario: Scenario, keys: IdempotencyKeys): Promise<void> => {
    const attempts = new Map<string, IdempotencyAttempt>();
    const started = new Map<string, Promise<BeginResult>>();

    const begin = async (requestName: string): Promise<BeginResult> => {
        const { scope, operation, key, ...request } = scenario.requests[requestName]!;
        const fingerprint = await computeFingerprint({ ...request, named: [] });
        return keys.begin({
            scope,
            ...(operation !== undefined && { operation }),
            key,
            fingerprint,
        });
    };
    const record = (name: string, result: BeginResult): BeginResult => {
        if (result.outcome === 'run') {
            attempts.set(name, result.attempt);
        }
        return result;
    };

    for (const step of scenario.steps) {
        if ('sleep' in step) {
            await setTimeout(step.sleep);
        } else if ('start' in step) {
            started.set(step.start, (async () => record(step.start, await begin(step.request)))());
        } else if ('begin' in step) {
            check(record(step.begin, await begin(step.request)), step.expect, step.response);
        } else if ('await' in step) {
            check(await started.get(step.await)!, step.expect, step.response);
        } else if ('respond' in step) {
            const responded = attempts.get(step.respond)!.respond(toStored(step.response));
            await (step.expect === 'error'
                ? expect(responded).to.be.rejectedWith(IdempotencyKeysResponseError)
                : expect(responded).to.eventually.equal(step.expect));
        } else {
            expect(await attempts.get(step.release)!.release()).to.equal(step.expect);
        }
    }
};

/**
 * Asserts that a request runs.
 *
 * @param result - What `begin()` answered
 * @returns Its attempt
 */
export const attemptOf = (result: BeginResult): IdempotencyAttempt => {
    expect(result.outcome).to.equal('run');
    return (result as Extract<BeginResult, { outcome: 'run' }>).attempt;
};
