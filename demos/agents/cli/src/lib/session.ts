import { randomUUID } from 'node:crypto';
import {
    chmod,
    mkdir,
    readdir,
    readFile,
    rename,
    rm,
    rmdir,
    stat,
    writeFile,
} from 'node:fs/promises';
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
 * Rethrows `error` unless it has one of `codes`, which are expected: e.g. a file another process removed first.
 *
 * @param error - Caught
 * @param codes - The `code`s to expect
 * @throws {unknown} `error`, when it's not expected
 */
const rethrowUnless = (error: unknown, ...codes: readonly string[]): void => {
    if (!codes.includes((error as { readonly code?: unknown }).code as string)) {
        throw error;
    }
};

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
     * Creates the directory (owner-only) if there's none, e.g. to log out before logging in. One that exists is left
     * as it is: saving a session makes it owner-only.
     *
     * @param use - Holds the lock while it runs
     * @returns What `use` returns
     * @rejects When the lock can't be created, e.g. the directory isn't writable
     */
    public async locked<T>(use: () => Promise<T>): Promise<T> {
        await mkdir(this.#directory, { recursive: true, mode: ownerOnlyDirectory });
        const id = await this.#acquire();
        try {
            return await use();
        } finally {
            await this.#release(id);
        }
    }

    /**
     * The lock is a directory holding one file, named by a new id of its holder's. It's made under a name of its own,
     * then renamed into place: only one process can do that (renaming a directory onto one that isn't empty fails), and
     * the lock is never there without its holder.
     *
     * Being a directory is what makes taking over a dead lock safe: a command removes only the holder's file it found
     * dead, by its name, and then the directory only if it's empty. Removing a lock file by name instead would remove
     * whatever is there by then: when two commands take over a dead lock at once, the slower one would remove the lock
     * the faster one just made, and both would hold it.
     *
     * @returns The holder's id
     * @rejects When the lock can't be made
     */
    async #acquire(): Promise<string> {
        const id = randomUUID();
        const made = `${this.#lock}.${id}.tmp`;
        await mkdir(made, { mode: ownerOnlyDirectory });
        await writeFile(Path.join(made, id), '', { mode: ownerOnlyFile });
        try {
            for (;;) {
                try {
                    await rename(made, this.#lock);
                    return id;
                } catch (error) {
                    // Held: Linux says `ENOTEMPTY`, other systems may say `EEXIST`
                    rethrowUnless(error, 'ENOTEMPTY', 'EEXIST');
                }
                const held = await this.#holder();
                if (held && Date.now() - held.sinceMs > staleLockMs) {
                    await this.#release(held.id);
                } else if (held) {
                    await sleep(lockRetryMs);
                }
            }
        } finally {
            await rm(made, { recursive: true, force: true });
        }
    }

    /**
     * Who holds the lock, read from its holder's file: its name, and when it was made.
     *
     * @returns The holder. `null` when the lock is released (or being released) since: a race to expect, not an error
     * @rejects When the lock can't be read
     */
    async #holder(): Promise<{ readonly id: string; readonly sinceMs: number } | null> {
        try {
            const [id] = await readdir(this.#lock);
            if (id !== undefined) {
                const { mtimeMs } = await stat(Path.join(this.#lock, id));
                return { id, sinceMs: mtimeMs };
            }
            // Released since, or being released: only in a race, which the tests can't make happen on demand
            /* c8 ignore next 5 */
        } catch (error) {
            rethrowUnless(error, 'ENOENT');
        }
        return null;
    }

    /**
     * Releases the lock if `id` still holds it, and leaves it alone if another does: e.g. this command ran so long that
     * its lock was taken over.
     *
     * @param id - The holder's
     * @rejects When the lock can't be removed
     */
    async #release(id: string): Promise<void> {
        await rm(Path.join(this.#lock, id), { force: true });
        try {
            await rmdir(this.#lock);
        } catch (error) {
            // Released by another command taking it over, or held by another already
            rethrowUnless(error, 'ENOENT', 'ENOTEMPTY', 'EEXIST');
        }
    }

    async #ensureDirectory(): Promise<void> {
        await mkdir(this.#directory, { recursive: true, mode: ownerOnlyDirectory });
        // `mkdir` leaves a directory that already exists as it is
        await chmod(this.#directory, ownerOnlyDirectory);
    }
}
