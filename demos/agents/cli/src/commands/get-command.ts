/* eslint-disable @typescript-eslint/no-magic-numbers -- HTTP status codes, as the notes API's spec documents them */
import type { Command, NotesCommandInput } from './lib/types.js';
import { bind } from 'haywire';
import { NotesCliError } from '../lib/errors.js';
import { connect, refused } from '../lib/notes.js';
import { SessionStore } from '../lib/session.js';
import { commandId } from './lib/types.js';

interface GetCommandExtendedInput extends NotesCommandInput {
    id: string;
}

/**
 * Prints one note: its title, then its body.
 */
export const noteGetCommand: Command<GetCommandExtendedInput> = {
    command: 'get <id>',
    describe: 'Print a note: its title, then its body',
    builder: yargs =>
        yargs.positional('id', {
            type: 'string',
            describe: 'From notes list',
            demandOption: true,
        }),
    handler: async ({ configDir, json, id }) => {
        const notes = await connect(new SessionStore(configDir));
        const read = await notes.call('getNote', { path: { noteId: id } });
        if (read.status === 404) {
            throw new NotesCliError(
                `No note has the id ${id}. notes list shows the ids there are.`
            );
        }
        if (read.status !== 200) {
            throw refused(read);
        }
        console.log(json ? JSON.stringify(read.body) : `${read.body.title}\n\n${read.body.body}`);
    },
};

export const noteGetCommandBinding = bind(commandId).withInstance(cli =>
    cli.command(noteGetCommand)
);
