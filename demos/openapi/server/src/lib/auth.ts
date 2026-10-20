import type { Authenticator } from './types.js';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Hashes a token for comparison.
 *
 * @param token - Bearer token
 * @returns Its SHA-256, so tokens of any length compare in the same time
 */
const digest = (token: string): Buffer => createHash('sha256').update(token).digest();

/**
 * Accepts a fixed list of tokens, e.g. API keys from a secret store. Compared in constant time, so how long a
 * comparison takes says nothing about how much of a guess was right.
 *
 * @param tokens - Every token allowed
 * @returns Authenticator
 */
export const staticTokens = (tokens: readonly string[]): Authenticator => {
    const allowed = tokens.map(token => digest(token));
    return token => {
        const candidate = digest(token);
        let isMatch = false;
        // Every token is compared, rather than stopping at the first match
        for (const hash of allowed) {
            isMatch = timingSafeEqual(hash, candidate) || isMatch;
        }
        return isMatch;
    };
};
