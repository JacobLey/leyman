import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import Path from 'node:path';

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
     * When the access token expires, in milliseconds since the epoch.
     */
    readonly expiresAt: number;
}

const ownerOnlyDirectory = 0o700;
const ownerOnlyFile = 0o600;

/**
 * The session, in a file only its owner can read (`0600`, in a `0700` directory): it holds a refresh token, which is
 * as good as a password until it's revoked.
 */
export class SessionStore {
    readonly #directory: string;
    readonly #file: string;

    public constructor(directory: string) {
        this.#directory = directory;
        this.#file = Path.join(directory, 'session.json');
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

    public async save(session: Session): Promise<void> {
        await mkdir(this.#directory, { recursive: true, mode: ownerOnlyDirectory });
        await writeFile(this.#file, JSON.stringify(session), { mode: ownerOnlyFile });
    }

    public async remove(): Promise<void> {
        await rm(this.#file, { force: true });
    }
}
