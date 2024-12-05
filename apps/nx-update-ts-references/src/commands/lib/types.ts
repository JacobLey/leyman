import type { CommandModule } from 'yargs';

export interface UpdateTsReferencesCommandInput {
    packageRoot: string;
}

export type Command<ExtendedInput extends UpdateTsReferencesCommandInput> = Pick<
    CommandModule<UpdateTsReferencesCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;

export interface AbstractCommand
    extends Pick<
        CommandModule<UpdateTsReferencesCommandInput, UpdateTsReferencesCommandInput>,
        'builder' | 'command' | 'describe'
    > {
    handler: (args: any) => Promise<void>;
}
