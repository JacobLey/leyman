import type { ChildProcess } from 'node:child_process';
import type { Context } from 'mocha';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { before } from 'mocha-chain';

export type Language = 'go' | 'ts';

/**
 * The Go server, built by the tests rather than an Nx target: no lifecycle stage builds Go binaries, and the test
 * target already hashes the Go sources (`^goSource`), so a change to them reruns it. Go's build cache keeps a
 * rebuild to about a second.
 */
// eslint-disable-next-line unicorn/no-missing-local-resource -- Built by the tests below, so absent from a clean checkout
const goBinary = fileURLToPath(new URL('../../bin/idempotency-keys-interop-go', import.meta.url));
const goProject = fileURLToPath(new URL('../../../idempotency-keys-interop-go', import.meta.url));
// eslint-disable-next-line unicorn/no-missing-local-resource -- Compiled from `server.ts`, beside this module
const tsServer = fileURLToPath(new URL('../server/server.js', import.meta.url));

// At the top level of a module, a hook applies to every test: a root hook, run once per process
before(async function (this: Context) {
    this.timeout(120_000);
    await promisify(execFile)('go', ['build', '-o', goBinary, '.'], { cwd: goProject });
});

/**
 * The configuration both servers read from the environment.
 */
export interface ServerConfig {
    readonly store: 'postgres' | 'valkey';
    readonly notifier: 'none' | 'postgres' | 'valkey';
    readonly table: string;
    readonly prefix: string;
    readonly channel: string;
    readonly leaseMs: number;
    readonly waitMs: number;
    readonly databaseUrl: string;
    readonly valkeyUrl: string;
}

export interface Server {
    readonly language: Language;
    readonly port: number;
    /**
     * Resolves once the handler starts running a request of the scope. Call it before sending the request.
     */
    readonly started: (scope: string) => Promise<void>;
    readonly kill: (signal: 'SIGKILL' | 'SIGTERM') => Promise<void>;
}

/**
 * Starts a server as a child process, on a free port it picks itself and prints.
 *
 * @param language - Which implementation
 * @param config - Its configuration
 * @returns The server, once listening
 */
export const startServer = async (language: Language, config: ServerConfig): Promise<Server> => {
    const env = {
        // eslint-disable-next-line n/no-process-env -- Inherited, for PATH and the rest
        ...process.env,
        IK_STORE: config.store,
        IK_NOTIFIER: config.notifier,
        IK_TABLE: config.table,
        IK_PREFIX: config.prefix,
        IK_CHANNEL: config.channel,
        IK_LEASE_MS: String(config.leaseMs),
        IK_WAIT_MS: String(config.waitMs),
        DATABASE_URL: config.databaseUrl,
        VALKEY_URL: config.valkeyUrl,
    };
    const child: ChildProcess =
        language === 'go'
            ? spawn(goBinary, [], { env, stdio: ['ignore', 'pipe', 'pipe'] })
            : spawn(process.execPath, [tsServer], { env, stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
    });
    const exited = once(child, 'exit');

    const waiting = new Map<string, () => void>();
    const port = await new Promise<number>((resolve, reject) => {
        createInterface({ input: child.stdout! }).on('line', line => {
            const [event, value = ''] = line.split(' ', 2);
            if (event === 'listening') {
                resolve(Number(value));
            } else if (event === 'run') {
                waiting.get(value)?.();
                waiting.delete(value);
            }
        });
        void exited.then(([code]) => {
            reject(
                new Error(
                    `The ${language} server exited with ${String(code)} before listening: ${stderr}`
                )
            );
        });
    });

    return {
        language,
        port,
        started: async scope =>
            new Promise(resolve => {
                waiting.set(scope, resolve);
            }),
        kill: async signal => {
            if (!(child.exitCode === null && child.signalCode === null)) {
                return;
            }

            child.kill(signal);
            await exited;
        },
    };
};
