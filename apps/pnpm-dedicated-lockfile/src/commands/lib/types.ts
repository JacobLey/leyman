import type { CommandModule } from 'yargs';

export interface LockfileCommandInput {
    cwd: string;
}

export type Command<ExtendedInput extends LockfileCommandInput> = Pick<
    CommandModule<LockfileCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;

export interface AbstractCommand
    extends Pick<
        CommandModule<LockfileCommandInput, LockfileCommandInput>,
        'builder' | 'command' | 'describe'
    > {
    handler: (args: any) => Promise<void>;
}
