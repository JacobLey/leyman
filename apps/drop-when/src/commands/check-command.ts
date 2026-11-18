import type { Command, DropWhenCommandInput } from './lib/types.js';
import { bind } from 'haywire';
import { formatMalformed, plural } from '#internal/lib/format.js';
import { scan } from '#internal/lib/scan.js';
import { pathsPositional } from './lib/paths.js';
import { commandId } from './lib/types.js';

/**
 * Fails on any malformed marker. It reads only the files, so its result depends on nothing else.
 */
export const checkCommand: Command<DropWhenCommandInput> = {
    command: 'check [paths..]',
    describe: 'Fail on any malformed marker, without going online',
    builder: yargs => pathsPositional(yargs).strict(),
    handler: async ({ paths }) => {
        const result = await scan('.', paths);
        if ('error' in result) {
            console.error(result.error);
            process.exitCode = 1;
            return;
        }

        const { files, markers, malformed } = result;
        if (malformed.length > 0) {
            console.error(formatMalformed(malformed));
            process.exitCode = 1;
            return;
        }

        console.log(
            `${plural(markers.length, 'marker')} in ${plural(files, 'file')}, none malformed`
        );
    },
};

export const checkCommandBinding = bind(commandId).withInstance(cli => cli.command(checkCommand));
