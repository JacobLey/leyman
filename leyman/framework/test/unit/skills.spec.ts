import type { Files } from '../lib/repo.js';
import { lstat, readlink } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { linkSkills } from '@leyman/framework';
import { afterEach, suite, test } from 'mocha-chain';
import { link, writeRepo } from '../lib/repo.js';

const skill = (name: string): string => `---\nname: ${name}\ndescription: ${name}\n---\n`;

const workspace: Files = {
    'package.json': { name: 'workspace', private: true },
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'packages/lib/package.json': { name: '@leyman/configs' },
    'packages/lib/skills/principles/SKILL.md': skill('principles'),
    'packages/lib/skills/README.md': '# Not a skill\n',
};

const linkOf = async (root: string, path: string): Promise<string | undefined> => {
    try {
        const stats = await lstat(Path.join(root, path));
        return stats.isSymbolicLink() ? await readlink(Path.join(root, path)) : undefined;
    } catch {
        return undefined;
    }
};

suite('linkSkills', () => {
    const removes: (() => Promise<void>)[] = [];
    const repo = async (files: Files): Promise<string> => {
        const written = await writeRepo(files, workspace);
        removes.push(written.remove);
        return written.root;
    };

    afterEach(async () => {
        await Promise.all(removes.splice(0).map(async remove => remove()));
    });

    test('Links a workspace package to its source, and .claude/skills', async () => {
        const root = await repo({});

        const result = await linkSkills({ cwd: root });

        expect(result).to.deep.equal({
            links: [
                {
                    name: 'principles',
                    package: '@leyman/configs',
                    target: '../../packages/lib/skills/principles',
                },
            ],
            changes: [
                '.agents/skills/principles -> ../../packages/lib/skills/principles',
                '.claude/skills -> ../.agents/skills',
            ],
            problems: [],
        });
        expect(await linkOf(root, '.agents/skills/principles')).to.equal(
            '../../packages/lib/skills/principles'
        );
        expect(await linkOf(root, '.claude/skills')).to.equal('../.agents/skills');
        expect(await linkSkills({ cwd: root }))
            .to.have.property('changes')
            .that.deep.equals([]);
    });

    test('Changes nothing with check', async () => {
        const root = await repo({});

        const result = await linkSkills({ cwd: root, check: true });

        expect(result.changes).to.have.length(2);
        expect(await linkOf(root, '.agents/skills/principles')).to.equal(undefined);
        expect(await linkOf(root, '.claude/skills')).to.equal(undefined);
    });

    test('Links installed packages, at the root or in a workspace package', async () => {
        const root = await repo({
            'packages/lib/package.json': { name: 'lib' },
            'node_modules/@leyman/configs/skills/principles/SKILL.md': skill('principles'),
            'packages/lib/node_modules/nx-lifecycle/skills/lifecycle/SKILL.md': skill('lifecycle'),
            'packages/lib/node_modules/other/skills/other/SKILL.md': skill('other'),
        });

        const result = await linkSkills({
            cwd: root,
            packages: ['@leyman/configs', 'nx-lifecycle', 'missing'],
        });

        expect(result.links.map(({ name, target }) => [name, target])).to.deep.equal([
            ['lifecycle', '../../packages/lib/node_modules/nx-lifecycle/skills/lifecycle'],
            ['principles', '../../node_modules/@leyman/configs/skills/principles'],
        ]);
        expect(result.problems).to.deep.equal([]);
    });

    test('Replaces and removes links, and keeps the repository own skills', async () => {
        const root = await repo({
            '.agents/skills/principles': link('../../elsewhere'),
            '.agents/skills/gone': link('../../packages/old/skills/gone'),
            '.agents/skills/own/SKILL.md': skill('own'),
            '.claude/skills': link('../.agents/skills'),
        });

        const result = await linkSkills({ cwd: root });

        expect(result.changes).to.deep.equal([
            '.agents/skills/principles -> ../../packages/lib/skills/principles',
            '.agents/skills/gone: removed, no package ships it',
        ]);
        expect(await linkOf(root, '.agents/skills/principles')).to.equal(
            '../../packages/lib/skills/principles'
        );
        expect(await linkOf(root, '.agents/skills/gone')).to.equal(undefined);
        expect(await lstat(Path.join(root, '.agents/skills/own/SKILL.md'))).to.have.property(
            'size'
        );
    });

    test('Reports what it cannot link', async () => {
        const root = await repo({
            'packages/other/package.json': { name: '@leyman/eslint-config' },
            'packages/other/skills/principles/SKILL.md': skill('principles'),
            'packages/other/skills/linting/SKILL.md': skill('linting'),
            '.agents/skills/linting/SKILL.md': skill('linting'),
            '.claude/skills/own/SKILL.md': skill('own'),
        });

        const result = await linkSkills({ cwd: root, check: true });

        expect(result.problems).to.deep.equal([
            'principles: shipped by both @leyman/configs and @leyman/eslint-config',
            "linting: .agents/skills/linting is the repository's own, so @leyman/eslint-config's isn't linked",
            ".claude/skills isn't a link to ../.agents/skills: move its skills to .agents/skills, then remove it",
        ]);
        expect(result.changes).to.deep.equal([
            '.agents/skills/principles -> ../../packages/lib/skills/principles',
        ]);
    });

    test('Leaves a repository without skills alone', async () => {
        const root = await repo({ 'packages/lib/skills/principles/SKILL.md': null });

        expect(await linkSkills({ cwd: root })).to.deep.equal({
            links: [],
            changes: [],
            problems: [],
        });
        expect(await linkOf(root, '.claude/skills')).to.equal(undefined);
    });

    test('Defaults to the working directory', async () => {
        const root = await repo({});
        const cwd = process.cwd();
        process.chdir(root);
        try {
            const result = await linkSkills();
            expect(result.links).to.have.length(1);
        } finally {
            process.chdir(cwd);
        }
    });

    test('Treats a file where a directory belongs as nothing', async () => {
        const root = await repo({
            'packages/lib/skills/principles/SKILL.md': null,
            'packages/lib/skills/README.md': null,
            'packages/lib/skills': 'Not a directory\n',
            'node_modules/@leyman/expect': 'Not a directory\n',
        });

        const result = await linkSkills({ cwd: root });
        expect(result.links).to.deep.equal([]);
    });

    test('Fails on paths it cannot read', async () => {
        const installed = await repo({ 'node_modules/loopy': link('loopy') });
        const shipped = await repo({
            'packages/lib/skills/principles/SKILL.md': null,
            'packages/lib/skills/README.md': null,
            'packages/lib/skills': link('skills'),
        });
        const linked = await repo({ '.agents': link('.agents') });

        await expect(
            linkSkills({ cwd: installed, packages: ['loopy'] })
        ).to.eventually.be.rejectedWith(/ELOOP/v);
        await expect(linkSkills({ cwd: shipped })).to.eventually.be.rejectedWith(/ELOOP/v);
        await expect(linkSkills({ cwd: linked })).to.eventually.be.rejectedWith(/ELOOP/v);
    });
});
