import type { ExecutorContext } from '@nx/devkit';
import type { Logger } from './logger.js';

export interface RawHandler<Options> {
    (options: Options, context: ExecutorContext): Promise<{ success: boolean }>;
}

export class Handler {
    #logger: Logger;

    constructor(logger: Logger) {
        this.#logger = logger;
    }

    public handle<Options>(
        this: this,
        rawHandler: RawHandler<Options>
    ): RawHandler<Options> {
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
