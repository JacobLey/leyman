import type { ServerEvent } from './server-event.js';
import { StaticEmitter } from 'static-emitter';

export const eventSym = Symbol('eventSymbol');

/**
 * @override
 */
export class CustomEmitter extends StaticEmitter<{
    foo: 123;
    bar: ServerEvent<'bar'>;
    [eventSym]: { myData: string };
}> {}
