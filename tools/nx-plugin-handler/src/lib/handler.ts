import type { ExecutorContext } from '@nx/devkit';
import type { Logger } from './logger.js';

export type RawHandler<Options> = (
    options: Options,
    context: ExecutorContext
) => Promise<{ success: boolean }>;

export interface IHandler {
    handle: <Options>(this: void, rawHandler: RawHandler<Options>) => RawHandler<Options>;
}

/**
 * Higher Order Component that wraps the real plugin executor
 * with some helpers to perform error handling and extra logging.
 */
export class Handler implements IHandler {
    readonly #logger: Logger;

    public constructor(logger: Logger) {
        this.#logger = logger;
        this.handle = this.handle.bind(this);
    }

    public handle<Options>(rawHandler: RawHandler<Options>): RawHandler<Options> {
        return async (options, context) => {
            try {
                return await rawHandler(options, context);
            } catch (error) {
                if (error instanceof Error) {
                    this.#logger.error(error.message);
                } else {
                    this.#logger.error('Unknown Error', error);
                }
                return { success: false };
            }
        };
    }
}
