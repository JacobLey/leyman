import type { Lockfile } from '@pnpm/lockfile.fs';
import type { PopulateFile } from 'npm-populate-files';
import type { Argv } from 'yargs';
import type { ParseCwd } from '../lib/dependencies.js';
import type { GetPrunedLockfile } from '../lib/pruned-lockfile.js';
import type { Command, LockfileCommandInput } from './lib/types.js';
import { createHash } from 'node:crypto';
import Path from 'node:path';
import { isCI } from 'ci-info';

interface LockfileCommandExtendedInput extends LockfileCommandInput {
    ci: boolean;
    dryRun: boolean;
    lockfileName: string;
    hash: boolean;
    omitComment: boolean;
    omitLinks: boolean;
}

/**
 * Main `barrel` command
 */
export class LockfileCommand implements Command<LockfileCommandExtendedInput> {
    public readonly command = ['$0', 'lockfile'];
    public readonly describe = "Write lockfile based on packages's portion of lockfile";

    readonly #parseCwd: ParseCwd;
    readonly #getPrunedLockfile: GetPrunedLockfile;
    readonly #populateFile: PopulateFile;

    public constructor(
        parseCwd: ParseCwd,
        getPrunedLockfile: GetPrunedLockfile,
        populateFile: PopulateFile
    ) {
        this.#parseCwd = parseCwd;
        this.#getPrunedLockfile = getPrunedLockfile;
        this.#populateFile = populateFile;

        this.handler = this.handler.bind(this);
    }

    public builder(
        this: void,
        yargs: Argv<LockfileCommandInput>
    ): Argv<LockfileCommandExtendedInput> {
        return yargs
            .options({
                ci: {
                    describe: 'Fail if lockfile is not up to date. Implies --dry-run',
                    type: 'boolean',
                    default: isCI,
                },
                dryRun: {
                    alias: 'dry-run',
                    describe: 'Do not write lockfile',
                    type: 'boolean',
                    default: false,
                },
                hash: {
                    describe: 'Hash the file rather than JSON.',
                    type: 'boolean',
                    default: false,
                },
                omitComment: {
                    alias: 'omit-comment',
                    describe: 'Exclude top level comment on file.',
                    type: 'boolean',
                    default: false,
                },
                lockfileName: {
                    alias: 'lockfile-name',
                    describe: 'File name of lockfile',
                    type: 'string',
                    default: '.pnpm-lock',
                },
                omitLinks: {
                    alias: 'omit-links',
                    describe: 'Exclude dependencies brought in by locally linked packages.',
                    type: 'boolean',
                    default: false,
                },
            })
            .strict();
    }

    public async handler(options: LockfileCommandExtendedInput): Promise<void> {
        const cwd = await this.#parseCwd(options.cwd);

        const prunedLockfile = await this.#getPrunedLockfile({ cwd, omitLinks: options.omitLinks });

        const annotatedHashFile = await this.#annotateLockfile({
            lockfile: prunedLockfile,
            omitComment: options.omitComment,
            shouldHash: options.hash,
        });

        const { updated } = await this.#populateFile(
            {
                filePath: Path.join(cwd, options.lockfileName),
                content: annotatedHashFile,
            },
            {
                cwd,
                dryRun: options.ci || options.dryRun,
                check: false,
            }
        );

        if (options.ci && updated) {
            throw new Error('Lockfile was not up to date');
        }
    }

    async #annotateLockfile({
        lockfile,
        omitComment,
        shouldHash,
    }: {
        lockfile: Lockfile;
        omitComment: boolean;
        shouldHash: boolean;
    }): Promise<string> {
        const jsonLockfile = JSON.stringify(lockfile, null, 2);

        return [
            omitComment ? null : '// DO NOT EDIT MANUALLY - populated by pnpm-dedicated-lockfile',
            shouldHash
                ? Buffer.from(createHash('sha512').update(jsonLockfile).digest()).toString('base64')
                : jsonLockfile,
            '',
        ]
            .filter(x => x !== null)
            .join('\n');
    }
}
