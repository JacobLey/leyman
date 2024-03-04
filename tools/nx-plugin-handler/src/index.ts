import { bind, createContainer, createModule } from 'haystack-di';
import { loggerIdentifier } from './lib/logger.js';
import { Handler } from '#handler';

const handlerInstance = createContainer(
    createModule(
        bind(Handler)
            .withConstructorProvider()
            .withDependencies([loggerIdentifier])
    ).addBinding(bind(loggerIdentifier).withInstance(console))
).getSync(Handler);

export const handler = handlerInstance.handle.bind(handlerInstance);
