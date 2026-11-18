import type { Location, MalformedMarker } from './marker.js';

/**
 * Counts a noun.
 *
 * @param count - how many
 * @param noun - singular
 * @returns e.g. `1 marker`, `2 markers`
 */
export const plural = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Formats where a marker is.
 *
 * @param location - a marker's location
 * @returns `path:line`, which editors and terminals link to the line
 */
export const formatLocation = ({ path, line }: Location): string => `${path}:${line}`;

/**
 * Lists malformed markers, for the terminal.
 *
 * @param malformed - malformed markers, in order
 * @returns one line each, then a count
 */
export const formatMalformed = (malformed: readonly MalformedMarker[]): string =>
    [
        ...malformed.map(marker => `${formatLocation(marker)}: ${marker.problem}`),
        plural(malformed.length, 'malformed marker'),
    ].join('\n');
