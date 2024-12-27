import type { Logger } from './dependencies.js';
import type { GetForwardedHandler, RawHandler } from './forwarded-handler.js';

export type HandlerWrapper = <Options>(
    this: void,
    rawHandler: RawHandler<Options>
) => RawHandler<Options>;

/**
 * Higher Order Component that wraps the real plugin executor
 * with some helpers to perform error handling and extra logging.
 */
export class Handler {
    readonly #logger: Logger;
    readonly #getForwardedHandler: GetForwardedHandler;

    public readonly handle: HandlerWrapper;

    public constructor(logger: Logger, getForwardedHandler: GetForwardedHandler) {
        this.#logger = logger;
        this.#getForwardedHandler = getForwardedHandler;
        this.handle = this.#handle.bind(this);
    }

    #handle<Options>(rawHandler: RawHandler<Options>): RawHandler<Options> {
        return async (options, context) => {
            try {
                const handler = (await this.#getForwardedHandler<Options>(context)) ?? rawHandler;

                return await handler(options, { forwardedToProject: true, ...context });
            } catch (error) {
                if (error instanceof Error) {
                    this.#logger(error.message);
                } else {
                    this.#logger('Unknown Error', error);
                }
                return { success: false };
            }
        };
    }
}
