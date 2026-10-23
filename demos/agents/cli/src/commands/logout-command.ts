import type { Command, NotesCommandInput } from './lib/types.js';
import { bind } from 'haywire';
import { revoke } from '../lib/oauth.js';
import { SessionStore } from '../lib/session.js';
import { commandId } from './lib/types.js';

/**
 * Logs out: revokes the login at its authorization server (RFC 7009), and forgets it. It's forgotten even when
 * revoking fails, and the failure said.
 */
export const logoutCommand: Command<NotesCommandInput> = {
    command: 'logout',
    describe: 'Log out: revoke the login, and forget it',
    handler: async ({ configDir }) => {
        const store = new SessionStore(configDir);
        // Not while another command refreshes: it would save a session after this one forgets it
        await store.locked(async () => {
            const session = await store.load();
            if (session === null) {
                return;
            }
            try {
                if ((await revoke(session)) === 'unsupported') {
                    console.error(
                        `${session.issuer} can't revoke tokens: the login stays good there until it expires.`
                    );
                }
            } finally {
                await store.remove();
            }
        });
        console.log('Logged out');
    },
};

export const logoutCommandBinding = bind(commandId).withInstance(cli => cli.command(logoutCommand));
