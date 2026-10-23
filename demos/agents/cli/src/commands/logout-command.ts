import type { Command, NotesCommandInput } from './lib/types.js';
import { bind } from 'haywire';
import { SessionStore } from '../lib/session.js';
import { commandId } from './lib/types.js';

/**
 * Forgets the session. Its tokens stay valid until they expire: a real CLI would revoke them too (RFC 7009).
 */
export const logoutCommand: Command<NotesCommandInput> = {
    command: 'logout',
    describe: 'Forget the login',
    handler: async ({ configDir }) => {
        const store = new SessionStore(configDir);
        await store.remove();
        console.log('Logged out');
    },
};

export const logoutCommandBinding = bind(commandId).withInstance(cli => cli.command(logoutCommand));
