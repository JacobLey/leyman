/* eslint-disable @typescript-eslint/no-magic-numbers -- HTTP status codes, as the notes API's spec documents them */
import type { Command, NotesCommandInput } from './lib/types.js';
import { bind } from 'haywire';
import { connect, refused } from '../lib/notes.js';
import { SessionStore } from '../lib/session.js';
import { printable } from '../lib/text.js';
import { commandId } from './lib/types.js';

interface ListCommandExtendedInput extends NotesCommandInput {
    q: string | undefined;
    limit: number;
}

/**
 * How many notes `list` shows unless asked: each costs whoever reads them.
 */
const defaultLimit = 10;

/**
 * Lists notes, newest first: one line each (id, time, title), never their bodies.
 */
export const listCommand: Command<ListCommandExtendedInput> = {
    command: 'list',
    describe: 'List notes, newest first: id, time and title',
    builder: yargs =>
        yargs.options({
            q: { type: 'string', describe: 'Only notes whose title contains this' },
            limit: { type: 'number', describe: 'How many', default: defaultLimit },
        }),
    handler: async ({ configDir, json, q, limit }) => {
        const notes = await connect(new SessionStore(configDir));
        const listed = await notes.call('listNotes', {
            query: q === undefined ? { limit } : { q, limit },
        });
        if (listed.status !== 200) {
            throw refused(listed);
        }
        const summaries = listed.body.items.map(({ id, createdAt, title }) => ({
            id,
            createdAt,
            title,
        }));
        if (json) {
            console.log(JSON.stringify(summaries));
        } else if (summaries.length === 0) {
            console.log('No notes');
        } else {
            console.log(
                summaries
                    // One line each: a newline in a title is printed escaped
                    .map(({ id, createdAt, title }) => `${id}  ${createdAt}  ${printable(title)}`)
                    .join('\n')
            );
        }
    },
};

export const listCommandBinding = bind(commandId).withInstance(cli => cli.command(listCommand));
