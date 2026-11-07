/* eslint-disable @typescript-eslint/no-magic-numbers -- Tiers are numbered as the tiers page numbers them */

import type { AuditReport } from './audit.js';
import type { Tier } from './checks.js';
import { tiers } from './checks.js';

/**
 * Each tier's name, as the tiers page has it.
 */
export const tierNames: Readonly<Record<Tier, string>> = {
    1: 'Checks',
    2: 'Shared configs',
    3: 'Nx plugin and lifecycle',
    4: 'Devcontainer, CI and skills',
};

const tiersPage = 'https://jacobley.github.io/leyman/framework/adoption';

/**
 * Writes a report for a person or an agent to read: each tier's checks, each failure's problems and fix, and the tier
 * met.
 *
 * @param report - from `audit`
 * @param skill - path of the agent audit brief, for the judgment calls
 * @returns the text
 */
export const formatReport = (report: AuditReport, skill: string): string => {
    const lines = [`Audit of ${report.root}`];
    for (const tier of tiers) {
        lines.push('', `Tier ${tier}: ${tierNames[tier]}`);
        const results = report.checks.filter(check => check.tier === tier);
        for (const result of results) {
            if (result.skipped !== undefined) {
                lines.push(`  - ${result.title} (skipped: ${result.skipped})`);
            } else if (result.problems.length === 0) {
                lines.push(`  ✓ ${result.title}`);
            } else {
                lines.push(
                    `  ✗ ${result.title}`,
                    ...result.problems.map(problem => `      ${problem}`),
                    `    Fix: ${result.fix}`
                );
            }
        }
    }
    lines.push(
        '',
        report.tier === 0
            ? 'Meets no tier yet.'
            : `Meets tier ${report.tier}: ${tierNames[report.tier]}.`,
        `What each tier buys and costs: ${tiersPage}`,
        `For the judgment calls no script can make, give a coding agent the audit skill: ${skill}`
    );
    return lines.join('\n');
};
