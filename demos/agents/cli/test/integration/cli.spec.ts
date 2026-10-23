import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { notes as notesTable } from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { notes, testBrowser } from '../helpers/cli.js';
import { withStack } from '../helpers/stack.js';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/v;

suite('notes', () => {
    test('--help lists every command', async () => {
        const { stdout } = await notes('/nowhere', ['--help']);

        for (const command of ['login', 'logout', 'list', 'get <id>', 'add']) {
            expect(stdout).to.include(`notes ${command}`);
        }
    });

    test('Says where help is, without a command', async () => {
        const { code, stderr } = await notes('/nowhere', []);

        expect(code).to.equal(1);
        expect(stderr).to.include('Run notes --help for usage.');
    });

    const withStackOnly = withStack();

    withStackOnly.test('Says to log in, before logging in', async ({ configDir }) => {
        const { code, stderr } = await notes(configDir, ['list']);

        expect(code).to.equal(1);
        expect(stderr).to.equal('Not logged in. Run notes login --api <url> first.\n');
    });

    suite('login', () => {
        withStackOnly.test('Logs in with the browser in $BROWSER', async ({ api, configDir }) => {
            const { code, stdout, stderr } = await notes(configDir, ['login', '--api', api], {
                env: { BROWSER: testBrowser },
            });

            expect(code).to.equal(0);
            expect(stdout).to.equal(`Logged in to ${api}\n`);
            expect(stderr).to.match(/^Log in at: http:\/\/127\.0\.0\.1:\d+\/auth\?/v);
        });

        withStackOnly.test(
            'Logs in with the URL it prints, opened by hand',
            async ({ api, configDir }) => {
                const { code } = await notes(configDir, ['login', '--api', api, '--json'], {
                    openPrintedUrl: true,
                });

                expect(code).to.equal(0);
            }
        );

        withStackOnly.test('Takes the API from NOTES_API_URL', async ({ api, configDir }) => {
            const { stdout } = await notes(configDir, ['login', '--json'], {
                env: { BROWSER: testBrowser, NOTES_API_URL: api },
            });

            expect(JSON.parse(stdout)).to.deep.equal({ api });
        });

        withStackOnly.test(
            'Keeps the login where only its owner can read it',
            async ({ api, configDir }) => {
                await notes(configDir, ['login', '--api', api], { env: { BROWSER: testBrowser } });

                const { mode } = await stat(Path.join(configDir, 'session.json'));

                // Read and write for its owner, nothing for anyone else
                expect(mode.toString(8).slice(-3)).to.equal('600');
            }
        );

        withStackOnly.test(
            'Prints the URL, when $BROWSER can not be run',
            async ({ api, configDir }) => {
                const { code } = await notes(configDir, ['login', '--api', api], {
                    env: { BROWSER: '/no/such/browser' },
                    openPrintedUrl: true,
                });

                expect(code).to.equal(0);
            }
        );

        for (const [variable, path] of [
            ['XDG_CONFIG_HOME', ['notes-demo']],
            ['HOME', ['.config', 'notes-demo']],
        ] as const) {
            withStackOnly.test(
                `Keeps the login under $${variable} by default`,
                async ({ api, configDir }) => {
                    await notes(configDir, ['login', '--api', api], {
                        env: {
                            BROWSER: testBrowser,
                            NOTES_CONFIG_DIR: undefined,
                            XDG_CONFIG_HOME: undefined,
                            [variable]: configDir,
                        },
                    });

                    await stat(Path.join(configDir, ...path, 'session.json'));
                }
            );
        }

        withStackOnly.test(
            "Says what failed when the login can't be read",
            async ({ configDir }) => {
                // A directory where the file should be
                await mkdir(Path.join(configDir, 'session.json'));

                const { code, stderr } = await notes(configDir, ['list']);

                expect(code).to.equal(1);
                expect(stderr).to.match(/^Failed: EISDIR/v);
            }
        );

        withStackOnly.test('Fails when the user denies it', async ({ api, configDir }) => {
            const { code, stderr } = await notes(configDir, ['login', '--api', api], {
                env: {
                    BROWSER: testBrowser,
                    BROWSER_ANSWER: 'error=access_denied&state={state}&iss={iss}',
                },
            });

            expect(code).to.equal(1);
            expect(stderr).to.include('Login failed (access_denied). Run notes login again.');
        });

        withStackOnly.test(
            'Fails when the browser comes back with another state',
            async ({ api, configDir }) => {
                const { code, stderr } = await notes(configDir, ['login', '--api', api], {
                    env: {
                        BROWSER: testBrowser,
                        BROWSER_ANSWER: 'code=forged&state=forged&iss={iss}',
                    },
                });

                expect(code).to.equal(1);
                expect(stderr).to.match(/Login failed \(.*state.*\)/v);
            }
        );

        withStackOnly.test(
            'Fails for a URL that is not the API',
            async ({ authorization, configDir }) => {
                const { code, stderr } = await notes(configDir, [
                    'login',
                    '--api',
                    authorization.issuer,
                ]);

                expect(code).to.equal(1);
                expect(stderr).to.include("doesn't say how to log in");
            }
        );
    });

    suite('Logged in', () => {
        const withLogin = withStackOnly.beforeEach(async ({ api, configDir }) => {
            await notes(configDir, ['login', '--api', api], { env: { BROWSER: testBrowser } });
        });

        withLogin.test('Adds, lists and gets notes', async ({ configDir }) => {
            const added = await notes(configDir, ['add', '--title', 'Dolly', '--body', 'A sheep']);
            const id = added.stdout.trim();
            const listed = await notes(configDir, ['list']);
            const got = await notes(configDir, ['get', id]);

            expect(id).to.match(uuid);
            expect(listed.stdout).to.match(new RegExp(String.raw`^${id}  \S+  Dolly\n$`, 'v'));
            expect(got.stdout).to.equal('Dolly\n\nA sheep\n');
        });

        withLogin.test('Prints JSON when asked', async ({ configDir }) => {
            const added = await notes(configDir, ['add', '--title', 'Dolly', '--json']);
            const { id } = JSON.parse(added.stdout) as { readonly id: string };
            const listed = await notes(configDir, ['list', '--json']);
            const got = await notes(configDir, ['get', id, '--json']);

            expect(JSON.parse(listed.stdout))
                .to.have.length(1)
                .and.to.have.nested.property('[0].id', id);
            expect(JSON.parse(got.stdout)).to.include({ id, title: 'Dolly', body: '' });
        });

        withLogin.test('Reads a body from stdin when asked', async ({ configDir, db }) => {
            await notes(configDir, ['add', '--title', 'Dolly', '--stdin'], {
                input: 'A sheep\nCloned',
            });

            const [row] = await db.select().from(notesTable);
            expect(row).to.include({ body: 'A sheep\nCloned' });
        });

        withLogin.test('Lists only titles containing --q, up to --limit', async ({ configDir }) => {
            for (const title of ['Sheep 1', 'Goat', 'Sheep 2', 'Sheep 3']) {
                await notes(configDir, ['add', '--title', title]);
            }

            const { stdout } = await notes(configDir, [
                'list',
                '--q',
                'sheep',
                '--limit',
                '2',
                '--json',
            ]);

            expect(
                (JSON.parse(stdout) as { title: string }[]).map(({ title }) => title)
            ).to.deep.equal(['Sheep 3', 'Sheep 2']);
        });

        withLogin.test('Says when there are no notes', async ({ configDir }) => {
            const { stdout } = await notes(configDir, ['list']);

            expect(stdout).to.equal('No notes\n');
        });

        withLogin.test('Says how to find an id that exists', async ({ configDir }) => {
            const { code, stderr } = await notes(configDir, [
                'get',
                '00000000-0000-4000-8000-000000000000',
            ]);

            expect(code).to.equal(1);
            expect(stderr).to.equal(
                'No note has the id 00000000-0000-4000-8000-000000000000. notes list shows the ids there are.\n'
            );
        });

        withLogin.test("Says why the API refused what it's given", async ({ configDir }) => {
            const added = await notes(configDir, ['add', '--title', '']);
            const got = await notes(configDir, ['get', 'dolly']);
            const listed = await notes(configDir, ['list', '--limit', '0']);

            for (const { code, stderr } of [added, got, listed]) {
                expect(code).to.equal(1);
                expect(stderr).to.match(/^The API refused it: /v);
            }
        });

        withLogin.test('Refreshes an expired login', async ({ configDir }) => {
            const file = Path.join(configDir, 'session.json');
            const session = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
            await writeFile(file, JSON.stringify({ ...session, expiresAt: 0 }));

            const { code } = await notes(configDir, ['list']);

            expect(code).to.equal(0);
            const refreshed = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
            expect(refreshed.accessToken).to.not.equal(session.accessToken);
            expect(refreshed.expiresAt).to.be.above(Date.now());
        });

        for (const [name, change] of [
            ['without a refresh token', { refreshToken: null }],
            ['whose refresh is refused', { refreshToken: 'forged' }],
        ] as const) {
            withLogin.test(
                `Says to log in again, for an expired login ${name}`,
                async ({ configDir }) => {
                    const file = Path.join(configDir, 'session.json');
                    const session = JSON.parse(await readFile(file, 'utf8')) as Record<
                        string,
                        unknown
                    >;
                    await writeFile(file, JSON.stringify({ ...session, expiresAt: 0, ...change }));

                    const { code, stderr } = await notes(configDir, ['list']);

                    expect(code).to.equal(1);
                    expect(stderr).to.match(
                        /^The login has expired, .*Run notes login again\.\n$/v
                    );
                }
            );
        }

        withStackOnly.test(
            'Keeps no refresh token from a server that issues none',
            async ({ api, configDir }) => {
                await notes(configDir, ['login', '--api', api, '--client-id', 'no-refresh'], {
                    env: { BROWSER: testBrowser },
                });

                const session = JSON.parse(
                    await readFile(Path.join(configDir, 'session.json'), 'utf8')
                ) as Record<string, unknown>;
                expect(session.refreshToken).to.equal(null);
            }
        );

        withLogin.test(
            'Says to log in again when the API refuses the token',
            async ({ configDir }) => {
                const file = Path.join(configDir, 'session.json');
                const session = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
                await writeFile(file, JSON.stringify({ ...session, accessToken: 'forged' }));

                const { code, stderr } = await notes(configDir, ['list']);

                expect(code).to.equal(1);
                expect(stderr).to.match(
                    /^The API refused the login \(.*\)\. Run notes login again\.\n$/v
                );
            }
        );

        withLogin.test('Says what failed when the API is down', async ({ configDir, served }) => {
            await served.close();

            const { code, stderr } = await notes(configDir, ['list']);

            expect(code).to.equal(1);
            expect(stderr).to.equal('Failed: fetch failed\n');
        });

        withLogin.test('Logs out', async ({ configDir }) => {
            const loggedOut = await notes(configDir, ['logout']);
            const listed = await notes(configDir, ['list']);

            expect(loggedOut.stdout).to.equal('Logged out\n');
            expect(listed.stderr).to.equal('Not logged in. Run notes login --api <url> first.\n');
        });
    });
});
