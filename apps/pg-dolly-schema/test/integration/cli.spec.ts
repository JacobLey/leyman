import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { copyProject, dropAll, migrate, migrateTracked, uniquePrefix } from '../helpers/project.js';

const execAsync = promisify(exec);
const bin = Path.join(import.meta.dirname, '../../bin.mjs');

suite('cli', () => {
    test('--help', async () => {
        const result = await execAsync(`${bin} --help`);

        expect(result.stdout).to.contain(
            'Migrate an empty database and write its schema to a file'
        );
    });

    test('--version', async () => {
        const result = await execAsync(`${bin} --version`);

        expect(result.stdout).to.match(/^\d+\.\d+\.\d+\n$/u);
    });

    test('Requires --migrate', async () => {
        const thrown: unknown = await expect(execAsync(bin)).to.be.rejectedWith(Error);

        expect(thrown)
            .to.have.property('stderr')
            .that.includes('Missing required argument: migrate');
    });

    suite('snapshot', () => {
        const withProject = beforeEach(async () => ({
            project: await copyProject(),
            prefix: uniquePrefix(),
        }));
        withProject.afterEach(async ({ project, prefix }) => {
            await Promise.all([project.cleanup(), dropAll(prefix)]);
        });

        withProject.test('Writes schema.sql', async ({ project, prefix }) => {
            await execAsync(`${bin} --no-check --prefix ${prefix} --migrate '${migrate}'`, {
                cwd: project.path,
            });

            expect(await readFile(Path.join(project.path, 'schema.sql'), 'utf8')).to.include(
                'CREATE TABLE'
            );
        });

        withProject.test('Keeps the rows of each --data table', async ({ project, prefix }) => {
            await execAsync(`${bin} --no-check --prefix ${prefix} --data public.applied`, {
                cwd: project.path,
                // eslint-disable-next-line n/no-process-env -- The command sees the server, as any run would
                env: { ...process.env, PG_DOLLY_SCHEMA_MIGRATE: migrateTracked },
            });

            expect(await readFile(Path.join(project.path, 'schema.sql'), 'utf8')).to.include(
                'INSERT INTO public.applied'
            );
        });

        withProject.test(
            'Fails --check when schema.sql is missing',
            async ({ project, prefix }) => {
                await expect(
                    execAsync(`${bin} --check --prefix ${prefix} --migrate '${migrate}'`, {
                        cwd: project.path,
                    })
                ).to.be.rejectedWith(Error);
            }
        );

        withProject.test(
            'Takes the migrate command from PG_DOLLY_SCHEMA_MIGRATE',
            async ({ project, prefix }) => {
                await execAsync(`${bin} --no-check --prefix ${prefix}`, {
                    cwd: project.path,
                    // eslint-disable-next-line n/no-process-env -- Everything else as the test runs with
                    env: { ...process.env, PG_DOLLY_SCHEMA_MIGRATE: migrate },
                });

                expect(await readFile(Path.join(project.path, 'schema.sql'), 'utf8')).to.include(
                    'CREATE TABLE'
                );
            }
        );

        withProject.test('Takes --cwd and --file', async ({ project, prefix }) => {
            await execAsync(
                `${bin} --no-check --cwd ${project.path} --file structure.sql --prefix ${prefix} --migrate '${migrate}'`
            );

            expect(await readFile(Path.join(project.path, 'structure.sql'), 'utf8')).to.include(
                'CREATE TABLE'
            );
        });
    });
});
