import type { readFile as ReadFile } from 'node:fs/promises';
import Path from 'node:path';

export type GetGitIgnore = () => Promise<string[]>;

export const getGitIgnoreProvider =
    (readFile: typeof ReadFile, workspaceRoot: string): GetGitIgnore =>
    async () => {
        const gitIgnore = await readFile(Path.join(workspaceRoot, '.gitignore'), 'utf8').catch(
            () => ''
        );

        const paths = gitIgnore
            .split('\n')
            .map(row => row.trim())
            .filter(Boolean)
            .filter(row => !row.startsWith('#'));

        return [...new Set(['.git', ...paths])];
    };
