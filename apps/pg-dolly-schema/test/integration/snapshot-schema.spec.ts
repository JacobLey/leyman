import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import {
    PgDollySchemaEmptyError,
    PgDollySchemaError,
    PgDollySchemaMigrateError,
    snapshotSchema,
} from 'pg-dolly-schema';
import { clones, copyProject, dropAll, migrate, uniquePrefix } from '../helpers/project.js';

suite('snapshotSchema', () => {
    const withProject = beforeEach(async () => ({
        project: await copyProject(),
        prefix: uniquePrefix(),
    }));
    withProject.afterEach(async ({ project, prefix }) => {
        await Promise.all([project.cleanup(), dropAll(prefix)]);
    });

    const withSnapshot = withProject.beforeEach(({ project, prefix }) => ({
        snapshot: async (options: { readonly check?: boolean; readonly migrate?: string } = {}) =>
            snapshotSchema({ migrate, cwd: project.path, prefix, ...options }),
        schema: Path.join(project.path, 'schema.sql'),
    }));

    withSnapshot.test(
        'Writes what the migrations build to schema.sql',
        async ({ snapshot, schema }) => {
            await snapshot({ check: false });

            const written = await readFile(schema, 'utf8');
            expect(written).to.include('CREATE TABLE public.item');
            expect(written).to.include('CREATE TRIGGER upper_name');
        }
    );

    withSnapshot.test('Writes to the file given', async ({ project, prefix }) => {
        await snapshotSchema({
            migrate,
            prefix,
            cwd: project.path,
            file: 'db/structure.sql',
            check: false,
        });

        expect(await readFile(Path.join(project.path, 'db/structure.sql'), 'utf8')).to.include(
            'CREATE TABLE'
        );
    });

    withSnapshot.test('Passes the check when the file is up to date', async ({ snapshot }) => {
        await snapshot({ check: false });

        await snapshot({ check: true });
    });

    withSnapshot.test(
        'Fails the check when the file is out of date',
        async ({ snapshot, schema }) => {
            await snapshot({ check: false });
            await writeFile(schema, '-- edited by hand\n');

            await expect(snapshot({ check: true })).to.be.rejectedWith(Error);
            expect(await readFile(schema, 'utf8')).to.equal('-- edited by hand\n');
        }
    );

    withSnapshot.test('Fails the check when the file is missing', async ({ snapshot }) => {
        await expect(snapshot({ check: true })).to.be.rejectedWith(Error);
    });

    withSnapshot.test(
        'Fails the check when a migration is added',
        async ({ project, snapshot }) => {
            await snapshot({ check: false });
            await writeFile(
                Path.join(project.path, 'migrations/003-note.sql'),
                'ALTER TABLE item ADD note text;'
            );

            await expect(snapshot({ check: true })).to.be.rejectedWith(Error);
        }
    );

    withSnapshot.test(
        'Runs the migrations on an empty database',
        async ({ project, snapshot, prefix }) => {
            await snapshot({
                check: false,
                migrate: `psql --quiet -Atc "SELECT current_database()" "$DATABASE_URL" > database.txt && ${migrate}`,
            });

            expect(await readFile(Path.join(project.path, 'database.txt'), 'utf8')).to.match(
                new RegExp(`^${prefix}_`, 'u')
            );
        }
    );

    withSnapshot.test('Fails when the migrate command fails', async ({ snapshot }) => {
        await expect(snapshot({ check: false, migrate: 'exit 3' })).to.be.rejectedWith(
            PgDollySchemaMigrateError,
            'exit code 3'
        );
    });

    withSnapshot.test(
        'Fails when the migrate command leaves the database empty',
        async ({ snapshot }) => {
            await expect(snapshot({ check: false, migrate: 'true' })).to.be.rejectedWith(
                PgDollySchemaEmptyError
            );
        }
    );

    withSnapshot.test('Fails when the migrate command is killed', async ({ snapshot }) => {
        await expect(snapshot({ check: false, migrate: 'kill -9 $$' })).to.be.rejectedWith(
            PgDollySchemaMigrateError,
            'exit code none'
        );
    });

    withProject.test('Runs in the current directory by default', async ({ project, prefix }) => {
        const cwd = process.cwd();
        process.chdir(project.path);
        try {
            await snapshotSchema({ migrate, prefix, check: false });
        } finally {
            process.chdir(cwd);
        }

        expect(await readFile(Path.join(project.path, 'schema.sql'), 'utf8')).to.include(
            'CREATE TABLE'
        );
    });

    withSnapshot.test(
        'Keeps the database a failed migration ran on',
        async ({ snapshot, prefix }) => {
            await expect(snapshot({ check: false, migrate: 'exit 1' })).to.be.rejectedWith(
                PgDollySchemaError
            );

            expect(await clones(prefix)).to.have.length(1);
        }
    );

    withSnapshot.test(
        'Leaves no database behind when it succeeds',
        async ({ snapshot, prefix }) => {
            await snapshot({ check: false });

            expect(await clones(prefix)).to.deep.equal([]);
        }
    );

    withSnapshot.test(
        'Writes nothing when the migrate command fails',
        async ({ snapshot, schema }) => {
            await expect(snapshot({ check: false, migrate: 'exit 1' })).to.be.rejectedWith(
                PgDollySchemaError
            );

            await expect(readFile(schema, 'utf8')).to.be.rejectedWith(Error);
        }
    );
});
