import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';

/**
 * The devcontainer's `postgres` sidecar, or Dagger's service under the same hostname.
 */
// eslint-disable-next-line n/no-process-env -- Set by the devcontainer and Dagger
export const serverUrl = process.env.DATABASE_URL!;

/**
 * Each test uses its own prefix, so it only ever sees its own databases on the shared server.
 *
 * @returns A prefix no other test uses
 */
export const uniquePrefix = (): string => `t${randomUUID().replaceAll('-', '').slice(0, 12)}`;

/**
 * @param url - Database to connect to
 * @returns Connected client
 */
export const connect = async (url: string): Promise<pg.Client> => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    return client;
};

export interface DatabaseInfo {
    readonly oid: number;
    readonly datname: string;
    readonly datistemplate: boolean;
    readonly datallowconn: boolean;
    readonly comment: string | null;
}

/**
 * Inspects and changes the server behind `pg-dolly`'s back, as a person or another tool might.
 */
export class Server {
    readonly #client: pg.Client;

    private constructor(client: pg.Client) {
        this.#client = client;
    }

    public static async connect(): Promise<Server> {
        return new Server(await connect(serverUrl));
    }

    public async close(): Promise<void> {
        await this.#client.end();
    }

    /**
     * @param prefix - Database name prefix
     * @returns Every database with the prefix, by name
     */
    public async databases(prefix: string): Promise<DatabaseInfo[]> {
        const { rows } = await this.#client.query<DatabaseInfo>(
            `SELECT oid::int, datname, datistemplate, datallowconn, shobj_description(oid, 'pg_database') AS comment
            FROM pg_database WHERE starts_with(datname, $1) ORDER BY datname`,
            [`${prefix}_`]
        );
        return rows;
    }

    /**
     * @param prefix - Database name prefix
     * @returns Names of every database with the prefix, sorted
     */
    public async names(prefix: string): Promise<string[]> {
        const databases = await this.databases(prefix);
        return databases.map(({ datname }) => datname);
    }

    public async database(name: string): Promise<DatabaseInfo | undefined> {
        const { rows } = await this.#client.query<DatabaseInfo>(
            `SELECT oid::int, datname, datistemplate, datallowconn, shobj_description(oid, 'pg_database') AS comment
            FROM pg_database WHERE datname = $1`,
            [name]
        );
        return rows[0];
    }

    public async query(sql: string): Promise<void> {
        await this.#client.query(sql);
    }

    /**
     * Ends every connection with this `application_name`, as if its process crashed.
     *
     * @param applicationName - Name the connections gave
     */
    public async terminate(applicationName: string): Promise<void> {
        await this.#client.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1',
            [applicationName]
        );
    }

    /**
     * Marks a database invalid, as a `DROP DATABASE` interrupted in the middle leaves it.
     *
     * @param name - Database name
     */
    public async invalidate(name: string): Promise<void> {
        await this.#client.query('UPDATE pg_database SET datconnlimit = -2 WHERE datname = $1', [
            name,
        ]);
    }

    /**
     * Waits for every connection with this `application_name` to end. A closed connection's backend leaves
     * `pg_stat_activity` just after the client sees it close.
     *
     * @param applicationName - Name the connections gave
     * @returns Whether they all ended within a second
     */
    public async disconnected(applicationName: string): Promise<boolean> {
        for (let attempt = 0; attempt < 100; attempt++) {
            const { rows } = await this.#client.query<{ count: number }>(
                'SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1',
                [applicationName]
            );
            if (rows[0]?.count === 0) {
                return true;
            }
            await setTimeout(10);
        }
        return false;
    }

    /**
     * Creates a role that can create databases, but not drop those of others, as a shared server's users would be.
     *
     * @param name - Also the role's password
     * @returns The server's URL, as the role
     */
    public async createRole(name: string): Promise<string> {
        await this.#client.query(`CREATE ROLE ${name} LOGIN CREATEDB PASSWORD '${name}'`);
        const url = new URL(serverUrl);
        url.username = name;
        url.password = name;
        return url.href;
    }

    public async dropRole(name: string): Promise<void> {
        await this.#client.query(`DROP ROLE IF EXISTS ${name}`);
    }

    /**
     * Drops a database, whatever made it.
     *
     * @param name - Database name
     */
    public async drop(name: string): Promise<void> {
        const identifier = this.#client.escapeIdentifier(name);
        // An invalid database can't be altered, and only a template needs to be
        const database = await this.database(name);
        if (database?.datistemplate) {
            await this.#client.query(`ALTER DATABASE ${identifier} WITH IS_TEMPLATE false`);
        }
        await this.#client.query(`DROP DATABASE ${identifier} WITH (FORCE)`);
    }

    /**
     * Drops every database with the prefix, whatever made it.
     *
     * @param prefix - Database name prefix
     */
    public async dropAll(prefix: string): Promise<void> {
        const databases = await this.databases(prefix);
        for (const { datname } of databases) {
            await this.drop(datname);
        }
    }
}
