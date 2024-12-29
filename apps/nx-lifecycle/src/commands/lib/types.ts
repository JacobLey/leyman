import type { CommandModule } from 'yargs';

export interface LifecycleCommandInput {
    cwd: string;
}

export type Command<ExtendedInput extends LifecycleCommandInput> = Pick<
    CommandModule<LifecycleCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;

export interface AbstractCommand
    extends Pick<
        CommandModule<LifecycleCommandInput, LifecycleCommandInput>,
        'builder' | 'command' | 'describe'
    > {
    handler: (args: any) => Promise<void>;
}
