/* eslint-disable @typescript-eslint/no-magic-numbers -- HTTP status codes, as the spec documents them */
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Operation } from './operations.js';
import type { Authenticator, Caller, NotesHandlers, OperationId } from './types.js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { NotesResponseError } from './errors.js';
import { describeErrors, operations } from './operations.js';

/**
 * Says which authorization server issues tokens for the API (RFC 9728), so an OAuth client needs only the API's URL.
 */
export interface ProtectedResource {
    /**
     * The API's URL, which is also the audience its tokens are issued for.
     */
    readonly resource: string;
    readonly authorizationServers: readonly string[];
}

export interface NotesAppConfig {
    /**
     * Called with every error a request ends in (a 500): a handler that threw, or answered with something the spec
     * doesn't allow.
     */
    readonly onError: (error: Error) => void;
    /**
     * Serves the API's Protected Resource Metadata, and points to it from every `WWW-Authenticate` challenge. Only
     * for tokens from an authorization server (not static tokens).
     */
    readonly protectedResource?: ProtectedResource | undefined;
}

/**
 * Where RFC 9728 puts a resource's metadata: `/.well-known/oauth-protected-resource`, before the resource's path.
 *
 * @param resource - Where the API is served
 * @returns Where its metadata is
 */
const metadataUrl = (resource: string): URL => {
    const url = new URL(resource);
    url.pathname = `/.well-known/oauth-protected-resource${url.pathname.replace(/^\/$/v, '')}`;
    return url;
};

/**
 * What a request carries between its middleware: who it's from, once authenticated.
 */
interface NotesEnv {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Hono's name for them
    readonly Variables: { readonly caller: Caller };
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
 * Answers unless the request has a bearer token the authenticator accepts for the operation's scopes, as RFC 6750
 * says: a `401` without a token (`WWW-Authenticate: Bearer`) or with an invalid one (`error="invalid_token"`), and a
 * `403` with a valid token that lacks a scope (`error="insufficient_scope"`, naming every scope needed). Each
 * challenge points to the API's metadata, when it has some.
 *
 * @param authenticate - Checks bearer tokens
 * @param scopes - What the operation needs
 * @param metadata - The API's Protected Resource Metadata, if it serves it
 * @returns Middleware
 */
const requireToken = (
    authenticate: Authenticator,
    scopes: readonly string[],
    metadata: URL | null
): MiddlewareHandler<NotesEnv> => {
    const challenge = (...parameters: readonly string[]): string => {
        const all = metadata ? [`resource_metadata="${metadata.href}"`, ...parameters] : parameters;
        return all.length > 0 ? `Bearer ${all.join(', ')}` : 'Bearer';
    };
    return async (context, next) => {
        const token = bearer.exec(context.req.header('authorization') ?? '')?.groups?.token;
        if (token === undefined) {
            context.header('www-authenticate', challenge());
            return problem(context, 401, 'unauthorized', 'A bearer token is required');
        }
        const authentication = await authenticate(token, scopes);
        if (authentication === 'invalid') {
            context.header('www-authenticate', challenge('error="invalid_token"'));
            return problem(context, 401, 'unauthorized', 'The bearer token is not valid');
        }
        if (authentication === 'insufficient_scope') {
            context.header(
                'www-authenticate',
                challenge('error="insufficient_scope"', `scope="${scopes.join(' ')}"`)
            );
            return problem(
                context,
                403,
                'insufficient_scope',
                `The bearer token needs the scope ${scopes.join(' ')}`
            );
        }
        context.set('caller', authentication);
        return next();
    };
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
    async (context: Context<NotesEnv>): Promise<Response> => {
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
            input: unknown,
            caller: Caller
        ) => Promise<HandlerResult>;
        const result = await handler({ path, query, body }, context.get('caller'));

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
 * @param config - Error reporting, and the API's metadata
 * @returns Hono app, e.g. for `@hono/node-server`'s `serve`
 */
export const createApp = (
    handlers: NotesHandlers,
    authenticate: Authenticator,
    config: NotesAppConfig
): Hono => {
    const app = new Hono();
    const { protectedResource } = config;
    let metadata: URL | null = null;
    if (protectedResource) {
        metadata = metadataUrl(protectedResource.resource);
        app.get(metadata.pathname, context =>
            context.json({
                resource: protectedResource.resource,
                authorization_servers: protectedResource.authorizationServers,
                scopes_supported: [...new Set(operations.flatMap(({ scopes }) => scopes))],
                bearer_methods_supported: ['header'],
            })
        );
    }
    const limited = bodyLimit({
        maxSize: maxBodyBytes,
        onError: context => problem(context, 413, 'too_large', 'The body is too large'),
    });
    // The operations, each knowing its caller once authenticated
    const secured = new Hono<NotesEnv>();
    for (const operation of operations) {
        const method = operation.method.toUpperCase();
        // Handlers of a route run in the order they are added. Authentication comes first, so a caller without a
        // token learns nothing about what the operation accepts, not even how large a body may be.
        secured.on(method, operation.route, requireToken(authenticate, operation.scopes, metadata));
        if (operation.body) {
            secured.on(method, operation.route, limited);
        }
        secured.on(method, operation.route, serve(operation, handlers));
    }
    app.route('/', secured);
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
