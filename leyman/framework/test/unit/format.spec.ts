import { expect } from '@leyman/expect';
import { formatReport, frameworkPackages, tierNames } from '@leyman/framework';
import { suite, test } from 'mocha-chain';

suite('formatReport', () => {
    test('Shows each check, the failures with their fix, and the tier met', () => {
        const text = formatReport(
            {
                root: '/repo',
                tier: 1,
                checks: [
                    { id: 'a', tier: 1, title: 'A holds', fix: 'Fix A', problems: [] },
                    {
                        id: 'b',
                        tier: 1,
                        title: 'B holds',
                        fix: 'Fix B',
                        problems: [],
                        skipped: 'offline',
                    },
                    { id: 'c', tier: 2, title: 'C holds', fix: 'Fix C', problems: ['c1', 'c2'] },
                ],
            },
            '/skill.md'
        );

        expect(text).to.equal(
            [
                'Audit of /repo',
                '',
                'Tier 1: Checks',
                '  ✓ A holds',
                '  - B holds (skipped: offline)',
                '',
                'Tier 2: Shared configs',
                '  ✗ C holds',
                '      c1',
                '      c2',
                '    Fix: Fix C',
                '',
                'Tier 3: Nx plugin and lifecycle',
                '',
                'Tier 4: Devcontainer, CI and skills',
                '',
                'Meets tier 1: Checks.',
                'What each tier buys and costs: https://jacobley.github.io/leyman/framework/adoption',
                'For the judgment calls no script can make, give a coding agent the audit skill: /skill.md',
            ].join('\n')
        );
    });

    test('Says when no tier is met', () => {
        expect(formatReport({ root: '/repo', tier: 0, checks: [] }, '/skill.md')).to.include(
            '\nMeets no tier yet.\n'
        );
    });

    test('Names the tiers and packages', () => {
        expect(tierNames[4]).to.equal('Devcontainer, CI and skills');
        expect(frameworkPackages).to.include('@leyman/framework');
    });
});
