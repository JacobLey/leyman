import { bind, createContainer } from 'haywire';
import {
    createRequireId,
    dependenciesModule,
    getForwardedHandlerId,
    importIdentifier,
    loggerIdentifier,
} from './lib/dependencies.js';
import { ForwardedHandler } from './lib/forwarded-handler.js';
import { Handler } from './lib/handler.js';

export const handlerContainer = createContainer(
    dependenciesModule
        .addBinding(
            bind(Handler)
                .withConstructorProvider()
                .withDependencies([loggerIdentifier, getForwardedHandlerId])
        )
        .addBinding(
            bind(ForwardedHandler)
                .withConstructorProvider()
                .withDependencies([createRequireId, importIdentifier])
        )
        .addBinding(
            bind(getForwardedHandlerId)
                .withDependencies([ForwardedHandler])
                .withProvider(x => x.getForwardedHandler)
        )
);
