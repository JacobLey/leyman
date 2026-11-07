import { lstat, mkdir, readdir, readlink, rm, stat, symlink } from 'node:fs/promises';
import Path from 'node:path';
import { frameworkPackages } from './checks.js';
import { readWorkspace } from './workspace.js';

/**
 * Where skills live, for every agent but Claude Code.
 */
export const skillsDir = '.agents/skills';

/**
 * Where Claude Code reads skills: a link to {@link skillsDir}.
 */
export const claudeSkillsDir = '.claude/skills';

const claudeSkillsTarget = '../.agents/skills';

/**
 * Where and how {@link linkSkills} links.
 */
export interface LinkSkillsOptions {
    /**
     * Root of the repository.
     *
     * @default process.cwd()
     */
    readonly cwd?: string;
    /**
     * The packages whose skills to link.
     *
     * @default frameworkPackages
     */
    readonly packages?: readonly string[];
    /**
     * Report what would change without changing it.
     *
     * @default false
     */
    readonly check?: boolean;
}

/**
 * A skill a package ships, linked into {@link skillsDir}.
 */
export interface SkillLink {
    readonly name: string;
    readonly package: string;
    /**
     * Where the link points, relative to {@link skillsDir}.
     */
    readonly target: string;
}

/**
 * What {@link linkSkills} found, and changed or would change.
 */
export interface LinkSkillsResult {
    /**
     * Every skill the packages ship, sorted by name.
     */
    readonly links: readonly SkillLink[];
    /**
     * Each link added, replaced or removed (or, with `check`, that would be).
     */
    readonly changes: readonly string[];
    /**
     * What stops a skill from being linked: nothing changes for it.
     */
    readonly problems: readonly string[];
}

// A path under a file is as missing as one under nothing
const isMissing = (error: unknown): boolean =>
    ['ENOENT', 'ENOTDIR'].includes((error as { code?: unknown }).code as string);

const linkTarget = async (path: string): Promise<false | string | undefined> => {
    try {
        const stats = await lstat(path);
        return stats.isSymbolicLink() ? await readlink(path) : false;
    } catch (error) {
        if (isMissing(error)) {
            return undefined;
        }
        throw error;
    }
};

const isDirectory = async (path: string): Promise<boolean> => {
    try {
        const stats = await stat(path);
        return stats.isDirectory();
    } catch (error) {
        if (isMissing(error)) {
            return false;
        }
        throw error;
    }
};

const entries = async (dir: string): Promise<string[]> => {
    try {
        const names = await readdir(dir);
        return names.toSorted((a, b) => a.localeCompare(b));
    } catch (error) {
        if (isMissing(error)) {
            return [];
        }
        throw error;
    }
};

/**
 * Links the skills that installed packages ship (`skills/<name>/SKILL.md` in the package) into `.agents/skills/<name>`,
 * and `.claude/skills` to `.agents/skills`. A package of the workspace links to its source; any other to its install,
 * at the root or in a workspace package. Every link in `.agents/skills` belongs to this: one no package ships any more
 * is removed, while a skill directory of the repository's own is never touched.
 *
 * @param options - optional
 * @returns every skill linked, each change and each problem
 * @rejects {Error} when the root has no `package.json`
 */
export const linkSkills = async (options: LinkSkillsOptions = {}): Promise<LinkSkillsResult> => {
    const root = Path.resolve(options.cwd ?? process.cwd());
    const workspace = await readWorkspace(root);
    const skillsRoot = Path.join(root, skillsDir);
    const installRoots = ['.', ...workspace.packages.map(({ dir }) => dir)];

    const findPackage = async (name: string): Promise<string | undefined> => {
        const member = workspace.packages.find(({ packageJson }) => packageJson.name === name);
        if (member !== undefined) {
            return Path.join(root, member.dir);
        }
        for (const dir of installRoots) {
            const installed = Path.join(root, dir, 'node_modules', name);
            if (await isDirectory(installed)) {
                return installed;
            }
        }
        return undefined;
    };

    const problems: string[] = [];
    const found = new Map<string, SkillLink>();
    const packages = options.packages ?? frameworkPackages;
    for (const name of packages) {
        const dir = await findPackage(name);
        if (dir === undefined) {
            continue;
        }
        const shipped = await entries(Path.join(dir, 'skills'));
        for (const skill of shipped) {
            const skillDir = Path.join(dir, 'skills', skill);
            if (!(await isDirectory(skillDir))) {
                continue;
            }
            const other = found.get(skill);
            if (other === undefined) {
                found.set(skill, {
                    name: skill,
                    package: name,
                    target: Path.relative(skillsRoot, skillDir),
                });
            } else {
                problems.push(`${skill}: shipped by both ${other.package} and ${name}`);
            }
        }
    }

    const changes: string[] = [];
    const apply = async (change: string, action: () => Promise<void>): Promise<void> => {
        changes.push(change);
        if (options.check !== true) {
            await action();
        }
    };

    const links = found
        .values()
        .toArray()
        .toSorted((a, b) => a.name.localeCompare(b.name));
    for (const link of links) {
        const path = Path.join(skillsRoot, link.name);
        const current = await linkTarget(path);
        if (current === false) {
            problems.push(
                `${link.name}: ${skillsDir}/${link.name} is the repository's own, so ${link.package}'s isn't linked`
            );
        } else if (current !== link.target) {
            await apply(`${skillsDir}/${link.name} -> ${link.target}`, async () => {
                await mkdir(skillsRoot, { recursive: true });
                await rm(path, { force: true });
                await symlink(link.target, path);
            });
        }
    }
    const present = await entries(skillsRoot);
    for (const entry of present) {
        const path = Path.join(skillsRoot, entry);
        if (!found.has(entry) && (await linkTarget(path)) !== false) {
            await apply(`${skillsDir}/${entry}: removed, no package ships it`, async () =>
                rm(path)
            );
        }
    }

    const claudePath = Path.join(root, claudeSkillsDir);
    const claude = await linkTarget(claudePath);
    if (claude === undefined && (links.length > 0 || (await isDirectory(skillsRoot)))) {
        await apply(`${claudeSkillsDir} -> ${claudeSkillsTarget}`, async () => {
            await mkdir(Path.dirname(claudePath), { recursive: true });
            await symlink(claudeSkillsTarget, claudePath);
        });
    } else if (claude !== undefined && claude !== claudeSkillsTarget) {
        problems.push(
            `${claudeSkillsDir} isn't a link to ${claudeSkillsTarget}: move its skills to ${skillsDir}, then remove it`
        );
    }

    return { links, changes, problems };
};
