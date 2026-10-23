import type { Command, NotesCommandInput } from './lib/types.js';
import { spawn } from 'node:child_process';
import { bind } from 'haywire';
import { browser, defaultApi } from '../lib/environment.js';
import { login } from '../lib/oauth.js';
import { SessionStore } from '../lib/session.js';
import { commandId } from './lib/types.js';

interface LoginCommandExtendedInput extends NotesCommandInput {
    api: string;
    clientId: string;
}

/**
 * Sends the user to log in: prints the URL, for whoever runs the CLI to open (an agent can pass it on), and opens it
 * with `$BROWSER` when set.
 *
 * @param url - The authorization URL
 */
const openBrowser = async (url: URL): Promise<void> => {
    console.error(`Log in at: ${url.href}`);
    const command = browser();
    if (command) {
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
    describe: 'Log in to the notes API (opens a browser)',
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
        }) as never,
    handler: async ({ api, clientId, configDir, json }) => {
        const session = await login({ api, clientId, openBrowser });
        const store = new SessionStore(configDir);
        await store.save(session);
        console.log(json ? JSON.stringify({ api: session.api }) : `Logged in to ${session.api}`);
    },
};

export const loginCommandBinding = bind(commandId).withInstance(cli => cli.command(loginCommand));
