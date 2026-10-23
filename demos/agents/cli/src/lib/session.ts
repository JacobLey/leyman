import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { chmod, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * What `notes login` keeps: where the API is, who issues its tokens, and the tokens.
 */
export interface Session {
    /**
     * The API's URL, which is also its tokens' audience.
     */
    readonly api: string;
    readonly issuer: string;
    readonly clientId: string;
    readonly accessToken: string;
    readonly refreshToken: string | null;
    /**
     * When the access token expires, in milliseconds since the epoch. `null` when the authorization server didn't
     * say: the token is used until the API refuses it.
     */
    readonly expiresAt: number | null;
}

const ownerOnlyDirectory = 0o700;
const ownerOnlyFile = 0o600;

/**
 * How long a lock is waited for before it's taken to be left by a command that died: longer than a refresh can take
 * (its requests time out sooner).
 */
const staleLockMs = 30_000;
const lockRetryMs = 50;

/**
 * The session, in a file only its owner can read (`0600`, in a `0700` directory): it holds a refresh token, which is
 * as good as a password until it's revoked.
 */
export class SessionStore {
    readonly #directory: string;
    readonly #file: string;
    readonly #lock: string;

    public constructor(directory: string) {
        this.#directory = directory;
        this.#file = Path.join(directory, 'session.json');
        this.#lock = Path.join(directory, 'session.lock');
    }

    public async load(): Promise<Session | null> {
        try {
            return JSON.parse(await readFile(this.#file, 'utf8')) as Session;
        } catch (error) {
            if ((error as { readonly code?: unknown }).code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Replaces the session at once: written to a file of its own, then renamed over the old one, so no command ever
     * reads half of one. The new file is created owner-only, whatever the old one's mode was.
     *
     * @param session - To keep
     */
    public async save(session: Session): Promise<void> {
        await this.#ensureDirectory();
        const written = `${this.#file}.${randomUUID()}.tmp`;
        await writeFile(written, JSON.stringify(session), { mode: ownerOnlyFile, flag: 'wx' });
        await rename(written, this.#file);
    }

    public async remove(): Promise<void> {
        await rm(this.#file, { force: true });
    }

    /**
     * Runs `use` while no other command does, across processes: e.g. so that commands run in parallel refresh the
     * login once, rather than each spending the same refresh token (which an authorization server that rotates them
     * takes as a stolen token, and revokes the login). A lock older than 30 seconds is taken to be left by a command
     * that died, and taken over.
     *
     * The directory must exist: it does, once there's a session.
     *
     * @param use - Holds the lock while it runs
     * @returns What `use` returns
     * @rejects When the lock can't be created, e.g. the directory isn't writable
     */
    public async locked<T>(use: () => Promise<T>): Promise<T> {
        const lock = await this.#acquire();
        try {
            return await use();
        } finally {
            await lock.close();
            await rm(this.#lock, { force: true });
        }
    }

    async #acquire(): Promise<{ readonly close: () => Promise<void> }> {
        for (;;) {
            try {
                // Only one process can create it
                return await open(this.#lock, 'wx', ownerOnlyFile);
            } catch (error) {
                if ((error as { readonly code?: unknown }).code !== 'EEXIST') {
                    throw error;
                }
            }
            // Undefined when released since: a race to expect, not an error
            // eslint-disable-next-line n/no-sync -- Only the sync stat can answer undefined for a missing file
            const held = statSync(this.#lock, { throwIfNoEntry: false });
            if (held && Date.now() - held.mtimeMs > staleLockMs) {
                await rm(this.#lock, { force: true });
            } else {
                await sleep(lockRetryMs);
            }
        }
    }

    async #ensureDirectory(): Promise<void> {
        await mkdir(this.#directory, { recursive: true, mode: ownerOnlyDirectory });
        // `mkdir` leaves a directory that already exists as it is
        await chmod(this.#directory, ownerOnlyDirectory);
    }
}
