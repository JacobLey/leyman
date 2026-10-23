import type { Command, NotesCommandInput } from './lib/types.js';
import { spawn } from 'node:child_process';
import { bind } from 'haywire';
import { browser, defaultApi } from '../lib/environment.js';
import { login, loginWithDevice } from '../lib/oauth.js';
import { SessionStore } from '../lib/session.js';
import { commandId } from './lib/types.js';

interface LoginCommandExtendedInput extends NotesCommandInput {
    api: string;
    clientId: string;
    device: boolean;
    timeout: number;
}

/**
 * Ten minutes: long enough to log in at leisure, short enough that a login nobody finishes doesn't wait for days.
 */
const defaultTimeoutSeconds = 600;

/**
 * Sends the user to log in: prints the URL, for whoever runs the CLI to open (an agent can pass it on), and opens it
 * with `$BROWSER` when set.
 *
 * @param url - The authorization URL
 */
const openBrowser = async (url: URL): Promise<void> => {
    console.error(`Log in at: ${url.href}`);
    const command = browser();
    if (command !== null) {
        spawn(command, [url.href], { stdio: 'ignore', detached: true })
            .on('error', () => {
                // The URL is printed, so the user can still open it themselves
            })
            .unref();
    }
};

/**
 * Logs in to the notes API, through its authorization server, and keeps the session for every other command.
 */
export const loginCommand: Command<LoginCommandExtendedInput> = {
    command: 'login',
    describe: 'Log in to the notes API (opens a browser, or with --device, on another device)',
    builder: yargs =>
        yargs.options({
            api: {
                type: 'string',
                describe: 'The notes API URL',
                default: defaultApi(),
                demandOption: defaultApi() === undefined,
            },
            clientId: {
                type: 'string',
                describe: 'The OAuth client id the CLI is registered as',
                default: 'notes-cli',
            },
            device: {
                type: 'boolean',
                describe: 'Log in on another device, with a code: for a machine with no browser',
                default: false,
            },
            timeout: {
                type: 'number',
                describe: 'Seconds to wait for the login',
                default: defaultTimeoutSeconds,
            },
        }) as never,
    handler: async ({ api, clientId, configDir, device, json, timeout }) => {
        const session = device
            ? await loginWithDevice({
                  api,
                  clientId,
                  // Not opened here: the point is that this machine has no browser
                  show: ({ uri, userCode }) => {
                      console.error(`Log in at: ${uri}\nCode: ${userCode}`);
                  },
                  timeoutSeconds: timeout,
              })
            : await login({ api, clientId, openBrowser, timeoutSeconds: timeout });
        const store = new SessionStore(configDir);
        await store.save(session);
        console.log(json ? JSON.stringify({ api: session.api }) : `Logged in to ${session.api}`);
    },
};

export const loginCommandBinding = bind(commandId).withInstance(cli => cli.command(loginCommand));
