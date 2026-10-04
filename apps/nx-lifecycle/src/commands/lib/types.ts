import type { CommandModule } from 'yargs';

export interface LifecycleCommandInput {
    cwd: string;
}

export type Command<ExtendedInput extends LifecycleCommandInput> = Pick<
    CommandModule<LifecycleCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;
