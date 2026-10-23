import type { Argv, CommandModule } from 'yargs';
import { identifier } from 'haywire';

/**
 * Options every command takes.
 */
export interface NotesCommandInput {
    /**
     * Prints JSON instead of text, for a program to read.
     */
    json: boolean;
    /**
     * Where the session is kept.
     */
    configDir: string;
}

export type Command<ExtendedInput extends NotesCommandInput> = Pick<
    CommandModule<NotesCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;

/**
 * Adds a command to the CLI. Commands differ in the input their handler receives, so each is wrapped in a function
 * that registers it, keeping it type-checked against its own input.
 */
export type RegisterCommand = (cli: Argv<NotesCommandInput>) => Argv<NotesCommandInput>;

/**
 * Every command the CLI runs. Each command binds itself: `bind(commandId).withInstance(cli => cli.command(...))`.
 */
export const commandId = identifier<RegisterCommand>().list();
