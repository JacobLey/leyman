export type ImportableHandler<Handler extends (...args: any[]) => any> =
    | Handler
    | { default: { default: Handler } }
    | { default: Handler };
