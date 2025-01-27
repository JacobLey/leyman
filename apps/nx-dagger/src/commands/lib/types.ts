import type { CommandModule } from 'yargs';

export interface NxDaggerCommandInput {
    cwd: string;
}

export type Command<ExtendedInput extends NxDaggerCommandInput> = Pick<
    CommandModule<NxDaggerCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;

export interface AbstractCommand
    extends Pick<
        CommandModule<NxDaggerCommandInput, NxDaggerCommandInput>,
        'builder' | 'command' | 'describe'
    > {
    handler: (args: any) => Promise<void>;
}
