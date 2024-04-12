import { bind, createContainer, createModule } from 'haywire';
import { Handler, type IHandler } from '#handler';
import { loggerIdentifier } from './lib/logger.js';

export type { RawHandler } from '#handler';

const handlerInstance: IHandler = createContainer(
    createModule(
        bind(Handler)
            .withConstructorProvider()
            .withDependencies([loggerIdentifier])
    ).addBinding(bind(loggerIdentifier).withInstance(console))
).get(Handler);

export const handler = handlerInstance.handle;
