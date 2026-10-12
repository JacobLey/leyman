import type { ServerEvent } from './server-event.js';
import { StaticEmitter } from 'static-emitter';

/**
 * @override
 */
export class CustomEmitter extends StaticEmitter<{
    foo: 123;
    bar: ServerEvent<'bar'>;
    data: { myData: string };
    ready: undefined;
}> {}
