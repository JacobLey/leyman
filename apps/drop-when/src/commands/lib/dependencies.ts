import type { Fetch } from '#internal/lib/github.js';
import { identifier } from 'haywire';

/**
 * Makes the requests to GitHub.
 */
export const fetchId = identifier<Fetch>('fetch');

/**
 * The time now.
 */
export const clockId = identifier<() => Temporal.Instant>('clock');
