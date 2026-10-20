import { EventEmitter } from 'node:events';

/**
 * An emitter for BentoCache's events, to wait on what an instance does in the background.
 *
 * @returns Emitter to pass as the `emitter` option
 */
// eslint-disable-next-line unicorn/prefer-event-target -- BentoCache's `emitter` option takes Node's EventEmitter interface
export const cacheEvents = (): EventEmitter => new EventEmitter();
