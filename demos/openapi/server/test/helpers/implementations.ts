import type { Context } from 'mocha';
import type { ProtectedResource, StaticToken } from '@leyman/demo-openapi-server';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
    appConfigId,
    createNotesApp,
    databaseId,
    jwtAuthenticatorBinding,
    notesAppId,
    notesModule,
    staticTokens,
} from '@leyman/demo-openapi-server';
import { bind, createContainer } from 'haywire';
import { before } from 'mocha-chain';
import { run } from '#test/helpers/run.js';
import { listen } from '#test/helpers/serve.js';

/**
 * The Go module, `demos/openapi/go`, from `dist-test/helpers`. `project.json` lists it as an implicit dependency.
 */
export const goModule = fileURLToPath(new URL('../../../go/', import.meta.url));

/**
 * Where the `notes-server` binary is, once the root hook below has built it.
 */
const built = Promise.withResolvers<string>();

// At the top level of a module, a hook applies to every test: a root hook, run once per process
const withBuild = before(async function (this: Context) {
    // A cold build compiles pgx, jwx and the rest from source
    this.timeout(300_000);
    const directory = await mkdtemp(path.join(tmpdir(), 'notes-server-'));
    const binary = path.join(directory, 'notes-server');
    await run('go', ['build', '-o', binary, './cmd/notes-server'], { cwd: goModule });
    built.resolve(binary);
    return { directory };
});
withBuild.after(async ({ directory }) => {
    await rm(directory, { recursive: true, force: true });
});

/**
 * How a server checks tokens: a fixed list, or JWTs from an issuer.
 */
export type Authentication =
    | { readonly issuer: string; readonly audience: string }
    | { readonly tokens: readonly StaticToken[] };

export interface StartOptions {
    /**
     * A database with the database package's schema, which the server connects to with a pool of its own.
     */
    readonly databaseUrl: string;
    readonly authentication: Authentication;
    readonly protectedResource?: ProtectedResource;
}

export interface Started {
    readonly url: string;
    /**
     * Stops the server, and its pool, after running requests finish. Resolves with every error a request ended in (what
     * either server reports to `onError`), so a test can check them once nothing more can be reported. Calling it again
     * returns the same promise.
     */
    readonly close: () => Promise<readonly Error[]>;
}

export interface Implementation {
    readonly name: 'Go' | 'TypeScript';
    readonly start: (options: StartOptions) => Promise<Started>;
}

/**
 * Only the first call runs `close`.
 *
 * @param close - Stops something
 * @returns `close`, run at most once
 */
const onlyOnce = <T>(close: () => Promise<T>): (() => Promise<T>) => {
    let closing: Promise<T> | undefined;
    return async () => {
        closing ??= close();
        return closing;
    };
};

/**
 * The Hono app, in this process, on `@hono/node-server`.
 */
export const typescript: Implementation = {
    name: 'TypeScript',
    start: async ({ databaseUrl, authentication, protectedResource }) => {
        // A small pool: every test shares the server's `max_connections`
        const pool = new Pool({ connectionString: databaseUrl, max: 2 });
        const errors: Error[] = [];
        const onError = (error: Error): void => {
            errors.push(error);
        };
        const db = drizzle({ client: pool });
        // Static tokens through `createNotesApp`, and JWTs through haywire bindings, so both ways of building the
        // app are what the tests serve
        const app =
            'tokens' in authentication
                ? createNotesApp({
                      db,
                      protectedResource,
                      onError,
                      authenticate: staticTokens(authentication.tokens),
                  })
                : createContainer(
                      notesModule
                          .addBinding(bind(databaseId).withInstance(db))
                          .addBinding(jwtAuthenticatorBinding(authentication))
                          .addBinding(
                              bind(appConfigId).withInstance({ onError, protectedResource })
                          )
                  ).get(notesAppId);
        const served = await listen(app);
        return {
            url: served.url,
            close: onlyOnce(async () => {
                await served.close();
                await pool.end();
                return errors;
            }),
        };
    },
};

const errorPrefix = 'notes-server: ';

/**
 * Starts the `notes-server` binary built once per run, listening on a free port.
 *
 * @param options - As every implementation takes
 * @param extraArgs - More of its flags, for what only the binary can be told (such as `--idempotency-wait`)
 * @returns Where it listens, and how to stop it
 * @rejects {Error} When it exits before it listens, with what it printed to stderr
 */
export const startGo = async (
    { databaseUrl, authentication, protectedResource }: StartOptions,
    extraArgs: readonly string[] = []
): Promise<Started> => {
    const args = ['--listen', '127.0.0.1:0', '--database-url', databaseUrl, ...extraArgs];
    if ('tokens' in authentication) {
        for (const { subject, token } of authentication.tokens) {
            args.push('--static-token', `${subject}=${token}`);
        }
    } else {
        args.push('--jwt-issuer', authentication.issuer, '--jwt-audience', authentication.audience);
    }
    if (protectedResource) {
        args.push('--resource', protectedResource.resource);
        for (const server of protectedResource.authorizationServers) {
            args.push('--authorization-server', server);
        }
    }
    const child = spawn(await built.promise, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
    });
    const exited = once(child, 'close') as Promise<[number | null]>;
    // It prints its URL once it listens
    const listening = async (): Promise<string> => {
        const [line] = (await once(createInterface({ input: child.stdout }), 'line')) as [string];
        return line;
    };
    const exitedFirst = async (): Promise<null> => {
        await exited;
        return null;
    };
    const url = await Promise.race([listening(), exitedFirst()]);
    if (url === null) {
        throw new Error(`notes-server exited before listening: ${stderr}`);
    }
    return {
        url,
        close: onlyOnce(async () => {
            child.kill('SIGTERM');
            const [code] = await exited;
            if (code !== 0) {
                throw new Error(`notes-server exited with ${String(code)}: ${stderr}`);
            }
            // One line per error a request ended in
            return stderr
                .split('\n')
                .filter(line => line.startsWith(errorPrefix))
                .map(line => new Error(line.slice(errorPrefix.length)));
        }),
    };
};

/**
 * The Go server, as the `notes-server` binary.
 */
export const go: Implementation = { name: 'Go', start: async options => startGo(options) };

/**
 * Both servers, which the shared suites run against with the same expectations: the same document, served by each.
 */
export const implementations: readonly Implementation[] = [typescript, go];
