import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { notes as notesTable } from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { notes, testBrowser } from '../helpers/cli.js';
import { listenLeast } from '../helpers/least.js';
import { withStack } from '../helpers/stack.js';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/v;

/**
 * Changes the saved session, as time (or an attacker) would.
 *
 * @param configDir - Where it is
 * @param change - Fields to replace
 * @returns The session before
 */
const editSession = async (
    configDir: string,
    change: Readonly<Record<string, unknown>>
): Promise<Record<string, unknown>> => {
    const file = Path.join(configDir, 'session.json');
    const session = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...session, ...change }));
    return session;
};

const mkdtempConfig = async (): Promise<string> => mkdtemp(Path.join(tmpdir(), 'notes-cli-'));

const readSession = async (configDir: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(Path.join(configDir, 'session.json'), 'utf8')) as Record<
        string,
        unknown
    >;

suite('notes', () => {
    test('--help lists every command', async () => {
        const { stdout } = await notes('/nowhere', ['--help']);

        for (const command of ['login', 'logout', 'list', 'get <id>', 'add']) {
            expect(stdout).to.include(`notes ${command}`);
        }
    });

    test('Says where help is, without a command', async () => {
        const { code, stderr } = await notes('/nowhere', []);

        expect(code).to.equal(2);
        expect(stderr).to.include('Run notes --help for usage.');
    });

    test('Refuses a body both given and read from stdin', async () => {
        const { code, stderr } = await notes('/nowhere', [
            'add',
            '--title',
            'Dolly',
            '--body',
            'A sheep',
            '--stdin',
        ]);

        expect(code).to.equal(2);
        expect(stderr).to.match(/mutually exclusive/v);
    });

    const withStackOnly = withStack();

    withStackOnly.test('Says to log in, before logging in', async ({ configDir }) => {
        const { code, stderr } = await notes(configDir, ['list']);

        expect(code).to.equal(3);
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

            expect(code).to.equal(3);
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

                expect(code).to.equal(3);
                expect(stderr).to.match(/Login failed \(.*state.*\)/v);
            }
        );

        withStackOnly.test(
            'Gives up when the browser never comes back',
            async ({ api, configDir }) => {
                const { code, stderr } = await notes(
                    configDir,
                    ['login', '--api', api, '--timeout', '1'],
                    // Opens nothing
                    { env: { BROWSER: 'true' } }
                );

                expect(code).to.equal(3);
                expect(stderr).to.include('Login timed out after 1s. Run notes login again.');
            }
        );

        test('Logs in at a server that says the least it may', async () => {
            const least = await listenLeast();
            const configDir = await mkdtempConfig();
            try {
                const login = await notes(configDir, ['login', '--api', least.url], {
                    env: { BROWSER: testBrowser },
                });
                const listed = await notes(configDir, ['list']);

                expect(login.code).to.equal(0);
                // Found at OpenID Connect's well-known URL, asking for no scope as none are named
                expect(login.stderr).to.include(`Log in at: ${least.url}/authorize?`);
                expect(login.stderr).to.not.include('scope=');
                expect(listed.stdout).to.equal('No notes\n');
                // Used until the API refuses it
                expect(await readSession(configDir)).to.include({
                    expiresAt: null,
                    refreshToken: null,
                });
            } finally {
                await least.close();
                await rm(configDir, { recursive: true, force: true });
            }
        });

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

        withLogin.test('Prints control characters escaped', async ({ configDir }) => {
            const added = await notes(configDir, [
                'add',
                '--title',
                'Red\u{1B}[31m\nline',
                '--body',
                'One\n\tTwo\rThree',
            ]);
            const id = added.stdout.trim();

            const listed = await notes(configDir, ['list']);
            const got = await notes(configDir, ['get', id]);
            const json = await notes(configDir, ['get', id, '--json']);

            expect(listed.stdout).to.equal(`${listed.stdout.slice(0, 64)}Red\\u001b[31m\\nline\n`);
            // A body keeps its lines and tabs
            expect(got.stdout).to.equal('Red\\u001b[31m\\nline\n\nOne\n\tTwo\\rThree\n');
            expect(JSON.parse(json.stdout)).to.include({ title: 'Red\u{1B}[31m\nline' });
        });

        withStackOnly.test('Shows each user only their own notes', async ({ api, configDir }) => {
            const bobDir = await mkdtempConfig();
            try {
                await notes(bobDir, ['login', '--api', api], {
                    env: { BROWSER: testBrowser, BROWSER_USER: 'bob' },
                });
                await notes(configDir, ['login', '--api', api], { env: { BROWSER: testBrowser } });
                await notes(configDir, ['add', '--title', 'Dolly']);
                await notes(bobDir, ['add', '--title', 'Polly']);

                const mine = await notes(configDir, ['list', '--json']);
                const bobs = await notes(bobDir, ['list', '--json']);

                const titles = (stdout: string): string[] =>
                    (JSON.parse(stdout) as { title: string }[]).map(({ title }) => title);
                expect(titles(mine.stdout)).to.deep.equal(['Dolly']);
                expect(titles(bobs.stdout)).to.deep.equal(['Polly']);
            } finally {
                await rm(bobDir, { recursive: true, force: true });
            }
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
            const session = await editSession(configDir, { expiresAt: 0 });

            const { code } = await notes(configDir, ['list']);

            expect(code).to.equal(0);
            const refreshed = await readSession(configDir);
            expect(refreshed.accessToken).to.not.equal(session.accessToken);
            expect(refreshed.expiresAt).to.be.above(Date.now());
        });

        withLogin.test(
            'Refreshes once for commands run at once, and keeps the login',
            async ({ configDir }) => {
                await editSession(configDir, { expiresAt: 0 });

                // Each spending the same refresh token would revoke the login
                const runs = await Promise.all(
                    Array.from({ length: 4 }, async () => notes(configDir, ['list']))
                );
                await editSession(configDir, { expiresAt: 0 });
                const after = await notes(configDir, ['list']);

                expect(runs.map(({ code }) => code)).to.deep.equal([0, 0, 0, 0]);
                expect(after.code).to.equal(0);
                expect(await readdir(configDir)).to.deep.equal(['session.json']);
            }
        );

        withLogin.test(
            'Refreshes, and tries again, once the API refuses the token',
            async ({ configDir }) => {
                await editSession(configDir, { accessToken: 'forged' });

                const { code } = await notes(configDir, ['list']);

                expect(code).to.equal(0);
                const { accessToken } = await readSession(configDir);
                expect(accessToken).to.not.equal('forged');
            }
        );

        withLogin.test(
            'Refreshes at the issuer it logged in at, and says when that fails',
            async ({ configDir }) => {
                // Nothing listens there: the API would still name the dev server
                await editSession(configDir, { expiresAt: 0, issuer: 'http://127.0.0.1:1' });

                const { code, stderr } = await notes(configDir, ['list']);

                expect(code).to.equal(1);
                expect(stderr).to.match(
                    /^Failed to refresh the login at http:\/\/127\.0\.0\.1:1 \(/v
                );
            }
        );

        withLogin.test(
            'Makes a login others can read owner-only, when it is saved again',
            async ({ configDir }) => {
                await editSession(configDir, { expiresAt: 0 });
                await chmod(Path.join(configDir, 'session.json'), 0o644);
                await chmod(configDir, 0o755);

                await notes(configDir, ['list']);

                const [file, directory] = await Promise.all([
                    stat(Path.join(configDir, 'session.json')),
                    stat(configDir),
                ]);
                expect(file.mode.toString(8).slice(-3)).to.equal('600');
                expect(directory.mode.toString(8).slice(-3)).to.equal('700');
            }
        );

        for (const [name, change] of [
            ['without a refresh token', { refreshToken: null }],
            ['whose refresh is refused', { refreshToken: 'forged' }],
        ] as const) {
            withLogin.test(
                `Says to log in again, for an expired login ${name}`,
                async ({ configDir }) => {
                    await editSession(configDir, { expiresAt: 0, ...change });

                    const { code, stderr } = await notes(configDir, ['list']);

                    expect(code).to.equal(3);
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

                const { refreshToken } = await readSession(configDir);
                expect(refreshToken).to.equal(null);
            }
        );

        withLogin.test(
            'Says to log in again when the API refuses a token that can not be refreshed',
            async ({ configDir }) => {
                await editSession(configDir, { accessToken: 'forged', refreshToken: null });

                const { code, stderr } = await notes(configDir, ['list']);

                expect(code).to.equal(3);
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
