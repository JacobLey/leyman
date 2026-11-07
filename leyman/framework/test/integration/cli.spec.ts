import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { afterEach, suite, test } from 'mocha-chain';
import { link, writeRepo } from '../lib/repo.js';

const execFileAsync = promisify(execFile);

suite('cli', () => {
    const removes: (() => Promise<void>)[] = [];

    afterEach(async () => {
        await Promise.all(removes.splice(0).map(async remove => remove()));
    });

    test('--help lists the commands', async () => {
        const { stdout } = await execFileAsync('./bin.mjs', ['--help']);

        expect(stdout).to.include('leyman-framework audit');
    });

    test('--version', async () => {
        const { stdout } = await execFileAsync('./bin.mjs', ['--version']);

        expect(stdout).to.match(/^\d+\.\d+\.\d+\n$/v);
    });

    test('Fails without a command', async () => {
        const thrown: unknown = await expect(execFileAsync('./bin.mjs', [])).to.be.rejectedWith(
            Error
        );
        expect(thrown).to.have.property('stderr').that.includes('Not enough non-option arguments');
    });

    test('Audits a repository, and points at the skill it ships', async () => {
        const { root, remove } = await writeRepo({});
        removes.push(remove);

        const { stdout } = await execFileAsync('./bin.mjs', [
            'audit',
            '--cwd',
            root,
            '--offline',
            '--tier',
            '4',
        ]);

        expect(stdout).to.include(`Audit of ${root}\n`);
        expect(stdout).to.include('Meets tier 4: Devcontainer, CI and skills.');
        const skill = /audit skill: (?<path>\S+)$/v.exec(stdout.trim())!.groups!.path!;
        expect(await readFile(skill, 'utf8')).to.include('name: framework-audit');
    });

    test('Fails below the tier asked for', async () => {
        const { root, remove } = await writeRepo({ 'biome.json': null });
        removes.push(remove);

        const thrown: unknown = await expect(
            execFileAsync('./bin.mjs', ['audit', '--cwd', root, '--offline', '--tier', '2'])
        ).to.be.rejectedWith(Error);
        expect(thrown).to.have.property('code', 1);
        expect(thrown).to.have.property('stdout').that.includes('Meets tier 1: Checks.');
    });

    test('Reports a repository it cannot read', async () => {
        const { root, remove } = await writeRepo({}, {});
        removes.push(remove);

        const thrown: unknown = await expect(
            execFileAsync('./bin.mjs', ['audit', '--cwd', root, '--offline'])
        ).to.be.rejectedWith(Error);
        expect(thrown).to.have.property('stderr').that.includes('No package.json in');
    });

    suite('skills', () => {
        const repo = async (files: Record<string, unknown>): Promise<string> => {
            const written = await writeRepo(
                {
                    'package.json': { name: 'workspace', private: true },
                    'node_modules/@leyman/configs/skills/principles/SKILL.md': '# Principles\n',
                    'node_modules/extra/skills/extra/SKILL.md': '# Extra\n',
                    ...files,
                },
                {}
            );
            removes.push(written.remove);
            return written.root;
        };

        test('Checks, links, then finds nothing to change', async () => {
            const root = await repo({});
            const args = ['skills', '--cwd', root, '--package', 'extra'];

            const thrown: unknown = await expect(
                execFileAsync('./bin.mjs', [...args, '--check'])
            ).to.be.rejectedWith(Error);
            expect(thrown).to.have.property('code', 1);
            expect(thrown)
                .to.have.property('stdout')
                .that.includes(
                    'Would link .agents/skills/extra -> ../../node_modules/extra/skills/extra\n'
                );

            const linked = await execFileAsync('./bin.mjs', args);
            expect(linked.stdout).to.include('Linked .claude/skills -> ../.agents/skills\n');

            const again = await execFileAsync('./bin.mjs', args);
            expect(again.stdout).to.equal('2 package skills linked, nothing to change\n');
        });

        test('Fails on what it cannot link', async () => {
            const root = await repo({
                '.claude/skills': link('elsewhere'),
                '.agents/skills/principles/SKILL.md': '# Own\n',
            });

            const thrown: unknown = await expect(
                execFileAsync('./bin.mjs', ['skills', '--cwd', root])
            ).to.be.rejectedWith(Error);
            expect(thrown).to.have.property('code', 1);
            expect(thrown)
                .to.have.property('stderr')
                .that.includes(".claude/skills isn't a link to ../.agents/skills");
        });
    });
});
