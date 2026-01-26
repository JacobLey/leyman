import type { Lockfile } from '@pnpm/lockfile.fs';
import type { FindLockfileDir, ReadLockfile } from './dependencies.js';
import Path from 'node:path';
import { getLockfileImporterId } from '@pnpm/lockfile.fs';
import { pruneSharedLockfile } from '@pnpm/lockfile.pruner';
import { identifier } from 'haywire';

export type GetPrunedLockfile = (params: { cwd: string; omitLinks: boolean }) => Promise<Lockfile>;
export const getPrunedLockfileId = identifier<GetPrunedLockfile>();

export interface IPrunedLockfile {
    getPrunedLockfile: GetPrunedLockfile;
}

type ProjectId = keyof Lockfile['importers'];
const LINK_PREFIX = 'link:';

/**
 * Core logic for barrelify.
 */
export class PrunedLockfile implements IPrunedLockfile {
    readonly #findLockfileDir: FindLockfileDir;
    readonly #readLockfile: ReadLockfile;

    public constructor(findLockfileDir: FindLockfileDir, readLockfile: ReadLockfile) {
        this.#findLockfileDir = findLockfileDir;
        this.#readLockfile = readLockfile;
    }

    public async getPrunedLockfile({
        cwd,
        omitLinks,
    }: {
        cwd: string;
        omitLinks: boolean;
    }): Promise<Lockfile> {
        const lockfileDir = await this.#findLockfileDir(cwd);

        if (!lockfileDir) {
            throw new Error(`No lockfile found for package at ${cwd}`);
        }

        const lockfile = await this.#readLockfile(lockfileDir, { ignoreIncompatible: false });

        if (lockfile === null) {
            throw new Error(`No lockfile found at ${Path.resolve(lockfileDir, 'pnpm-lock.yaml')}`);
        }

        const baseImporterId = getLockfileImporterId(lockfileDir, cwd);

        return pruneSharedLockfile(this.#trimLinks({ lockfile, baseImporterId, omitLinks }));
    }

    #trimLinks({
        lockfile,
        baseImporterId,
        omitLinks,
    }: {
        lockfile: Lockfile;
        baseImporterId: string;
        omitLinks: boolean;
    }): Lockfile {
        const { importers } = lockfile;

        const dedicatedLockfile: Lockfile = { ...lockfile, importers: {} };

        let importersToInclude = new Set([baseImporterId as ProjectId]);
        const includedImporters = new Set<ProjectId>();

        while (importersToInclude.size > 0) {
            const nextImportersToInclude = new Set<ProjectId>();

            for (const importerToInclude of importersToInclude) {
                if (!includedImporters.has(importerToInclude) && importerToInclude in importers) {
                    includedImporters.add(importerToInclude);

                    if (omitLinks) {
                        continue;
                    }

                    const importer = importers[importerToInclude]!;
                    const allDependencies = {
                        ...importer.dependencies,
                        ...importer.devDependencies,
                        ...importer.optionalDependencies,
                    };
                    const links = Object.values(allDependencies)
                        .filter(link => link.startsWith(LINK_PREFIX))
                        .map(link => Path.join(importerToInclude, link.slice(LINK_PREFIX.length)));

                    for (const link of links) {
                        nextImportersToInclude.add(link as ProjectId);
                    }
                }
            }

            importersToInclude = nextImportersToInclude;
        }

        for (const importer of [...includedImporters.keys()].toSorted((a, b) =>
            a.localeCompare(b, 'en')
        )) {
            dedicatedLockfile.importers[importer] = importers[importer]!;
        }

        return dedicatedLockfile;
    }
}
