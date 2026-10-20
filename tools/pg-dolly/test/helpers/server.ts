import { randomUUID } from 'node:crypto';
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
     * Drops a database, whatever made it.
     *
     * @param name - Database name
     */
    public async drop(name: string): Promise<void> {
        const identifier = this.#client.escapeIdentifier(name);
        await this.#client.query(`ALTER DATABASE ${identifier} WITH IS_TEMPLATE false`);
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
