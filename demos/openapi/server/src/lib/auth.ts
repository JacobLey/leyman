import type { Authenticator } from './types.js';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Hashes a token for comparison.
 *
 * @param token - Bearer token
 * @returns Its SHA-256, so tokens of any length compare in the same time
 */
const digest = (token: string): Buffer => createHash('sha256').update(token).digest();

export interface StaticToken {
    readonly token: string;
    /**
     * Whose it is: the caller it's accepted as.
     */
    readonly subject: string;
}

/**
 * Accepts a fixed list of tokens, e.g. API keys from a secret store, each for one subject, with every scope. Compared
 * in constant time, so how long a comparison takes says nothing about how much of a guess was right.
 *
 * @param tokens - Every token allowed, and whose each is
 * @returns Authenticator
 */
export const staticTokens = (tokens: readonly StaticToken[]): Authenticator => {
    const allowed = tokens.map(({ token, subject }) => ({ hash: digest(token), subject }));
    return token => {
        const candidate = digest(token);
        let match: string | null = null;
        // Every token is compared, rather than stopping at the first match
        for (const { hash, subject } of allowed) {
            if (timingSafeEqual(hash, candidate)) {
                match = subject;
            }
        }
        return match === null ? 'invalid' : { subject: match };
    };
};
