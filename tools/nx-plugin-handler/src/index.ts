import { bind, createContainer, identifier } from 'haywire';
import {
    createRequireId,
    dependenciesModule,
    importIdentifier,
    loggerIdentifier,
} from './lib/dependencies.js';
import { ForwardedHandler, type GetForwardedHandler } from './lib/forwarded-handler.js';
import { Handler } from './lib/handler.js';

export type { PluginContext, RawHandler } from './lib/forwarded-handler.js';
export type { HandlerWrapper } from './lib/handler.js';

const getForwardedHandlerId = identifier<GetForwardedHandler>();

const handlerInstance = createContainer(
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
).get(Handler);

export const handler = handlerInstance.handle;
