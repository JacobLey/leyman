import type { CommandModule } from 'yargs';

export interface LoadPopulateFilesCommandInput {
    cwd: string;
}

export type Command<ExtendedInput extends LoadPopulateFilesCommandInput> = Pick<
    CommandModule<LoadPopulateFilesCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;

export interface AbstractCommand
    extends Pick<
        CommandModule<LoadPopulateFilesCommandInput, LoadPopulateFilesCommandInput>,
        'builder' | 'command' | 'describe'
    > {
    handler: (args: any) => Promise<void>;
}
