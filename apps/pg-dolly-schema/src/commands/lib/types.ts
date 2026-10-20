import type { Argv, CommandModule } from 'yargs';
import { identifier } from 'haywire';

export interface PgDollySchemaCommandInput {
    cwd: string;
}

export type Command<ExtendedInput extends PgDollySchemaCommandInput> = Pick<
    CommandModule<PgDollySchemaCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;

/**
 * Adds a command to the CLI.
 *
 * Commands differ in the input their handler receives, so they cannot share an element type.
 * Wrapping each in a function that registers it keeps every command type-checked against its own input.
 */
export type RegisterCommand = (
    cli: Argv<PgDollySchemaCommandInput>
) => Argv<PgDollySchemaCommandInput>;

/**
 * Every command the CLI runs. Each command binds itself:
 *
 * `bind(commandId).withInstance(cli => cli.command(myCommand))`
 */
export const commandId = identifier<RegisterCommand>().list();
