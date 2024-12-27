import { commonProxy } from './common-proxy.cjs';
import type { ImportableHandler } from './lib/types.cjs';

type DecoratorReturnType<
    Decorator extends (handler: (...args: any[]) => any, ...args: any[]) => (...args: any[]) => any,
    Handler extends (...args: any[]) => any,
> = ReturnType<Handler> extends Promise<unknown>
    ? // Similar to proxy, if the decorated method is already async, then keep type as-is
      Decorator
    : (
          ...handlerArgs: Parameters<Decorator>
      ) => (...args: Parameters<Handler>) => Promise<Awaited<ReturnType<Handler>>>;

export const commonProxyDecorator = <
    Decorator extends (handler: (...args: any[]) => any, ...args: any[]) => (...args: any[]) => any,
    Handler extends (...args: any[]) => any = ReturnType<Decorator>,
>(
    promiseOfDecorator: ImportableHandler<Decorator> | Promise<ImportableHandler<Decorator>>
): DecoratorReturnType<Decorator, Handler> =>
    ((handler: Handler, ...handlerArgs: unknown[]) =>
        async (...args: unknown[]) => {
            const proxied = await commonProxy(promiseOfDecorator)(handler, ...handlerArgs);
            return proxied(...args) as unknown;
        }) as DecoratorReturnType<Decorator, Handler>;
