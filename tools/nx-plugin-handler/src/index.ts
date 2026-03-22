import { handlerContainer } from './container.js';
import { Handler } from './lib/handler.js';

export type { PluginContext, RawHandler } from './lib/forwarded-handler.js';
export type { HandlerWrapper } from './lib/handler.js';

export const { handle: handler } = handlerContainer.get(Handler);
