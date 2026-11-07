// Links each skill a package of this workspace ships (`<package>/skills/<name>/SKILL.md`) into `.agents/skills/<name>`,
// pointing at its source. pnpm links the skills of installed dependencies once they're approved (`permissions` in
// `pnpm-workspace.yaml`), but never a workspace package's, which is where every one of this repository's lives.
//
//   node link-skills.mjs [--check]
//
// Every link in `.agents/skills` that isn't pnpm's (`pnpm-*`) belongs to this: one no package ships any more is removed.
// The repository's own skills are directories, and never touched. `--check` changes nothing and fails on what would
// change.
//
// Has no dependencies, like the other checks here that run from the checkout.

import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const workspaceRoot = path.resolve(import.meta.dirname, '../../..');
const skillsDir = '.agents/skills';
const skillsRoot = path.join(workspaceRoot, skillsDir);

// Where a link points, `false` for anything else, `null` for nothing
const linkTarget = file => {
    try {
        const stats = lstatSync(file);
        return stats.isSymbolicLink() ? readlinkSync(file) : false;
    } catch {
        return null;
    }
};

/**
 * The skills packages of this workspace ship, by name, each with the link's target relative to `.agents/skills`.
 *
 * @returns each skill's name and target, sorted by name
 * @throws {Error} when two packages ship a skill of the same name
 */
export const shippedSkills = () => {
    const files = execFileSync(
        // eslint-disable-next-line sonarjs/no-os-command-from-path -- the checkout's own Git, in a script run by hand or CI
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '*/skills/*/SKILL.md'],
        { cwd: workspaceRoot, encoding: 'utf8' }
    )
        .split('\0')
        .filter(file => file !== '' && !file.startsWith('.') && !file.includes('/.agents/'));
    const skills = new Map();
    for (const file of files) {
        const name = path.basename(path.dirname(file));
        const target = path.relative(skillsRoot, path.join(workspaceRoot, path.dirname(file)));
        if (skills.has(name)) {
            throw new Error(`Two packages ship a ${name} skill: ${skills.get(name)} and ${target}`);
        }
        skills.set(name, target);
    }
    return [...skills]
        .map(([name, target]) => ({ name, target }))
        .toSorted((a, b) => a.name.localeCompare(b.name));
};

const main = () => {
    const { values } = parseArgs({ options: { check: { default: false, type: 'boolean' } } });
    const skills = shippedSkills();
    const changes = [];
    const problems = [];

    for (const { name, target } of skills) {
        const file = path.join(skillsRoot, name);
        const current = linkTarget(file);
        if (current === false) {
            problems.push(
                `${skillsDir}/${name} is the repository's own skill, and a package ships one of that name`
            );
        } else if (current !== target) {
            changes.push(`${skillsDir}/${name} -> ${target}`);
            if (!values.check) {
                rmSync(file, { force: true });
                symlinkSync(target, file);
            }
        }
    }
    const shipped = new Set(skills.map(({ name }) => name));
    for (const entry of readdirSync(skillsRoot)) {
        const isStale =
            !shipped.has(entry) &&
            !entry.startsWith('pnpm-') &&
            typeof linkTarget(path.join(skillsRoot, entry)) === 'string';
        if (!isStale) {
            continue;
        }
        changes.push(`${skillsDir}/${entry}: removed, no package ships it`);
        if (!values.check) {
            rmSync(path.join(skillsRoot, entry));
        }
    }

    for (const change of changes) {
        console.log(values.check ? `Would link ${change}` : `Linked ${change}`);
    }
    if (values.check && changes.length > 0) {
        console.error('Run `node leyman/main/scripts/link-skills.mjs` to update the links');
    }
    for (const problem of problems) {
        console.error(problem);
    }
    if (problems.length > 0 || (values.check && changes.length > 0)) {
        process.exitCode = 1;
    }
};

if (process.argv[1] === import.meta.filename) {
    main();
}
