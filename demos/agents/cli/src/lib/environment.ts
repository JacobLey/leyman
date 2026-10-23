/* eslint-disable n/no-process-env -- The CLI's environment variables, read in one place */
import { homedir } from 'node:os';
import Path from 'node:path';

/**
 * The notes API's URL, unless `--api` says otherwise.
 *
 * @returns `$NOTES_API_URL`
 */
export const defaultApi = (): string | undefined => process.env.NOTES_API_URL;

/**
 * Where the login is kept, unless `--config-dir` says otherwise.
 *
 * @returns `$NOTES_CONFIG_DIR`, `$XDG_CONFIG_HOME/notes-demo`, or `~/.config/notes-demo`
 */
export const defaultConfigDir = (): string =>
    process.env.NOTES_CONFIG_DIR ??
    Path.join(process.env.XDG_CONFIG_HOME ?? Path.join(homedir(), '.config'), 'notes-demo');

/**
 * The browser to open the login in, as the convention goes.
 *
 * @returns The command in `$BROWSER`, or `null` when it's unset or empty (`BROWSER=` turns it off)
 */
export const browser = (): string | null => {
    const command = process.env.BROWSER ?? '';
    return command === '' ? null : command;
};
