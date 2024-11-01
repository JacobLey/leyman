import type { CommandModule } from 'yargs';

export interface BarrelCommandInput {
    cwd: string;
    ignore: string[] | undefined;
}

export type Command<ExtendedInput extends BarrelCommandInput> = Pick<
    CommandModule<BarrelCommandInput, ExtendedInput>,
    'builder' | 'command' | 'describe' | 'handler'
>;

export interface AbstractCommand
    extends Pick<
        CommandModule<BarrelCommandInput, BarrelCommandInput>,
        'builder' | 'command' | 'describe'
    > {
    handler: (args: any) => Promise<void>;
}
