import type { CommandModule } from 'yargs';

export interface LoadPopulateFilesCommandInput {
    cwd: string;
    targetDir: string;
}

export type Command<ExtendedInput extends LoadPopulateFilesCommandInput> = Pick<
    CommandModule<LoadPopulateFilesCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;
