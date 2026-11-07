import type { Check, CheckContext, Tier } from './checks.js';
import Path from 'node:path';
import { checks, maxTier } from './checks.js';
import { readWorkspace } from './workspace.js';

/**
 * A check's result.
 */
export interface CheckResult {
    readonly id: string;
    readonly tier: Tier;
    readonly title: string;
    readonly fix: string;
    /**
     * Each problem found: empty when it passes.
     */
    readonly problems: readonly string[];
    /**
     * Why the check didn't run, which doesn't hold its tier back.
     */
    readonly skipped?: string;
}

/**
 * What an audit found.
 */
export interface AuditReport {
    /**
     * Absolute path of the repository audited.
     */
    readonly root: string;
    /**
     * The highest tier met: every check of it and of the tiers before it passes. 0 when tier 1 isn't met.
     */
    readonly tier: 0 | Tier;
    /**
     * Every check, by tier.
     */
    readonly checks: readonly CheckResult[];
}

/**
 * What to audit, and how.
 */
export interface AuditOptions {
    /**
     * The repository root.
     *
     * @default process.cwd()
     */
    readonly cwd?: string;
    /**
     * Where the versions check finds each package's `latest` version, or `false` to skip it.
     *
     * @default npm's registry
     */
    readonly latestVersion?: CheckContext['latestVersion'];
}

const notFound = 404;

/**
 * Reads a package's `latest` version from npm's registry.
 *
 * @param name - the package
 * @returns its version, or `undefined` when npm has none
 * @rejects {Error} when the registry can't be reached
 */
export const npmLatestVersion = async (name: string): Promise<string | undefined> => {
    const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
    if (response.status === notFound) {
        return undefined;
    }
    if (!response.ok) {
        throw new Error(`npm's registry answered ${response.status} for ${name}`);
    }
    return ((await response.json()) as { version: string }).version;
};

const runCheck = async (check: Check, ...args: Parameters<Check['run']>): Promise<CheckResult> => {
    const { run, ...described } = check;
    const outcome = await run(...args);
    return 'skipped' in outcome
        ? { ...described, problems: [], skipped: outcome.skipped }
        : { ...described, problems: outcome };
};

/**
 * Audits how much of the framework a repository has adopted: runs every check of the four tiers on its files, and
 * reports the highest tier it meets.
 *
 * @param options - what to audit
 * @returns each check's result, and the tier met
 * @rejects {Error} when the root has no `package.json`
 */
export const audit = async (options: AuditOptions = {}): Promise<AuditReport> => {
    const root = Path.resolve(options.cwd ?? process.cwd());
    const workspace = await readWorkspace(root);
    const context: CheckContext = { latestVersion: options.latestVersion ?? npmLatestVersion };
    const results = await Promise.all(
        checks.map(async check => runCheck(check, workspace, context))
    );

    const failing = results.filter(({ problems }) => problems.length > 0);
    const firstFailing = Math.min(...failing.map(({ tier }) => tier));
    return {
        root,
        tier: (Number.isFinite(firstFailing) ? firstFailing - 1 : maxTier) as AuditReport['tier'],
        checks: results,
    };
};
