import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema.ts',
    out: './migrations',
    // Only read by `drizzle-kit migrate`, which `pg-dolly-schema` runs against a fresh, empty database
    // eslint-disable-next-line n/no-process-env -- Set by the devcontainer, Dagger, or pg-dolly-schema
    dbCredentials: { url: process.env.DATABASE_URL },
});
