/* eslint-disable @typescript-eslint/no-magic-numbers -- HTTP status codes, as the spec documents them */
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Operation } from './operations.js';
import type { Authenticator, NotesHandlers, OperationId } from './types.js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { NotesResponseError } from './errors.js';
import { describeErrors, operations } from './operations.js';

export interface NotesAppConfig {
    /**
     * Called with every error a request ends in (a 500): a handler that threw, or answered with something the spec
     * doesn't allow.
     */
    readonly onError: (error: Error) => void;
}

interface HandlerResult {
    readonly status: number;
    readonly body: unknown;
}

const bearer = /^Bearer (?<token>\S+)$/v;

/**
 * Larger than any body the spec allows: a note is at most 10,200 characters, each at most 12 bytes as JSON (an
 * escaped surrogate pair). A larger body is refused before it is read, rather than read whole and then rejected.
 */
const maxBodyBytes = 128 * 1024;

/**
 * An error response, in the spec's `ApiError` shape.
 *
 * @param context - Hono's context
 * @param status - Documented error status
 * @param code - Machine-readable reason
 * @param message - Why, for a person
 * @returns An `ApiError` response
 */
const problem = (
    context: Context,
    status: ContentfulStatusCode,
    code: string,
    message: string
): Response => context.json({ code, message }, status);

/**
 * The request's body as JSON, or why it isn't. Every request body in this spec is required, and JSON.
 *
 * @param context - Hono's context
 * @returns The body, or the reason it can't be read
 */
const readJson = async (
    context: Context
): Promise<{ readonly error: string } | { readonly json: unknown }> => {
    const [type] = (context.req.header('content-type') ?? '').split(';', 1);
    // Media types are case-insensitive
    if (type?.trim().toLowerCase() !== 'application/json') {
        return { error: 'body must be application/json' };
    }
    try {
        return { json: JSON.parse(await context.req.text()) };
    } catch {
        return { error: 'body is not valid JSON' };
    }
};

/**
 * Answers 401 unless the request has a bearer token the authenticator accepts.
 *
 * @param authenticate - Checks bearer tokens
 * @returns Middleware
 */
const requireToken =
    (authenticate: Authenticator): MiddlewareHandler =>
    async (context, next) => {
        const token = bearer.exec(context.req.header('authorization') ?? '')?.groups?.token;
        if (token === undefined || !(await authenticate(token))) {
            context.header('www-authenticate', 'Bearer');
            return problem(context, 401, 'unauthorized', 'A valid bearer token is required');
        }
        return next();
    };

// eslint-disable-next-line jsdoc/require-rejects -- The handler it returns rejects, not this function
/**
 * Serves one operation: validates the request, calls its handler, and validates the response.
 *
 * @param operation - From the spec
 * @param handlers - Every operation's handler
 * @returns Hono handler
 */
const serve =
    (operation: Operation, handlers: NotesHandlers) =>
    async (context: Context): Promise<Response> => {
        const path: Record<string, unknown> = { ...context.req.param() };
        const query: Record<string, unknown> = { ...context.req.query() };
        if (!operation.path(path)) {
            return problem(context, 400, 'invalid_request', describeErrors(operation.path, 'path'));
        }
        if (!operation.query(query)) {
            return problem(
                context,
                400,
                'invalid_request',
                describeErrors(operation.query, 'query')
            );
        }
        let body: unknown;
        if (operation.body) {
            const read = await readJson(context);
            if ('error' in read) {
                return problem(context, 400, 'invalid_request', read.error);
            }
            if (!operation.body(read.json)) {
                return problem(
                    context,
                    400,
                    'invalid_request',
                    describeErrors(operation.body, 'body')
                );
            }
            ({ json: body } = read);
        }

        const handler = handlers[operation.operationId as OperationId] as (
            input: unknown
        ) => Promise<HandlerResult>;
        const result = await handler({ path, query, body });

        const validate = operation.responses.get(result.status);
        if (!validate) {
            throw new NotesResponseError(
                operation.operationId,
                result.status,
                'the status is not documented'
            );
        }
        if (!validate(result.body)) {
            throw new NotesResponseError(
                operation.operationId,
                result.status,
                describeErrors(validate, 'body')
            );
        }
        return context.json(result.body, result.status as ContentfulStatusCode);
    };

/**
 * The notes API as a Hono app: a route for every operation in the spec, each validated against it.
 *
 * @param handlers - Every operation's handler
 * @param authenticate - Checks bearer tokens for the secured operations
 * @param config - Error reporting
 * @returns Hono app, e.g. for `@hono/node-server`'s `serve`
 */
export const createApp = (
    handlers: NotesHandlers,
    authenticate: Authenticator,
    config: NotesAppConfig
): Hono => {
    const app = new Hono();
    const authenticated = requireToken(authenticate);
    const limited = bodyLimit({
        maxSize: maxBodyBytes,
        onError: context => problem(context, 413, 'too_large', 'The body is too large'),
    });
    for (const operation of operations) {
        const method = operation.method.toUpperCase();
        // Handlers of a route run in the order they are added. Authentication comes first, so a caller without a
        // token learns nothing about what the operation accepts, not even how large a body may be.
        if (operation.secured) {
            app.on(method, operation.route, authenticated);
        }
        if (operation.body) {
            app.on(method, operation.route, limited);
        }
        app.on(method, operation.route, serve(operation, handlers));
    }
    // A path the spec has, with a method it doesn't. Registered after every operation, so only reached when none
    // matched. Hono answers HEAD with the GET handler.
    const byRoute = Map.groupBy(operations, operation => operation.route);
    for (const [route, methods] of byRoute) {
        const allow = methods
            .flatMap(({ method }) => (method === 'get' ? ['GET', 'HEAD'] : method.toUpperCase()))
            .join(', ');
        app.all(route, context => {
            context.header('allow', allow);
            return problem(context, 405, 'method_not_allowed', `Allowed: ${allow}`);
        });
    }
    app.notFound(context => problem(context, 404, 'not_found', 'No such path'));
    app.onError((error, context) => {
        config.onError(error);
        return problem(context, 500, 'internal_error', 'Internal error');
    });
    return app;
};
