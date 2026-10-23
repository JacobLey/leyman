/* eslint-disable @typescript-eslint/no-magic-numbers -- HTTP status codes, as the notes API's spec documents them */
import type { Command, NotesCommandInput } from './lib/types.js';
import { text } from 'node:stream/consumers';
import { bind } from 'haywire';
import { connect, refused } from '../lib/notes.js';
import { SessionStore } from '../lib/session.js';
import { commandId } from './lib/types.js';

interface AddCommandExtendedInput extends NotesCommandInput {
    title: string;
    body: string;
    stdin: boolean;
}

/**
 * Adds a note, printing its id. `--stdin` reads the body from stdin (`… | notes add --title T --stdin`), so long or
 * multi-line text needs no quoting. Only when asked: an agent's shell may leave stdin open, and reading it unasked
 * would wait forever.
 */
export const noteAddCommand: Command<AddCommandExtendedInput> = {
    command: 'add',
    describe: 'Add a note, and print its id',
    builder: yargs =>
        yargs.options({
            title: { type: 'string', describe: 'Its title', demandOption: true },
            body: { type: 'string', describe: 'Its body', default: '' },
            stdin: {
                type: 'boolean',
                describe: 'Read its body from stdin instead',
                default: false,
            },
        }),
    handler: async ({ configDir, json, title, body, stdin }) => {
        const notes = await connect(new SessionStore(configDir));
        const created = await notes.call('createNote', {
            body: { title, body: stdin ? await text(process.stdin) : body },
        });
        if (created.status !== 201) {
            throw refused(created);
        }
        console.log(json ? JSON.stringify({ id: created.body.id }) : created.body.id);
    },
};

export const noteAddCommandBinding = bind(commandId).withInstance(cli =>
    cli.command(noteAddCommand)
);
