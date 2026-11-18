import type { Fetch } from './github.js';
import type { Outcome, Release, Resolved } from './resolve.js';
import { parseMinAge } from './duration.js';
import { formatLocation, formatMalformed, plural } from './format.js';
import { GitHub } from './github.js';
import { resolveMarker } from './resolve.js';
import { scan } from './scan.js';

/**
 * What to report on.
 */
export interface ReportOptions {
    /**
     * The working directory.
     */
    readonly cwd: string;
    /**
     * Files or directories to scan, or all of `cwd` when empty.
     */
    readonly paths: readonly string[];
    /**
     * Files, or directories to leave out everything under.
     */
    readonly exclude: readonly string[];
    /**
     * How old a release must be before its marker is due, as given (`7d`, `12h`).
     */
    readonly minAge: string;
    /**
     * Also fail when a marker is due.
     */
    readonly failOnDue: boolean;
}

/**
 * What a report depends on beyond the files.
 */
export interface ReportDependencies {
    readonly fetch: Fetch;
    readonly now: Temporal.Instant;
    /**
     * Raises GitHub's rate limit, when set.
     */
    readonly token?: string;
}

/**
 * What the command prints, and its exit code.
 */
export interface ReportResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: 0 | 1;
}

type Section = 'decide' | 'due' | 'failed' | 'open' | 'waiting';

const sections: readonly { readonly section: Section; readonly heading: string }[] = [
    { section: 'due', heading: 'Due' },
    { section: 'decide', heading: 'Decide by hand' },
    { section: 'waiting', heading: 'Waiting' },
    { section: 'open', heading: 'Open' },
    { section: 'failed', heading: 'Failed lookups' },
];

const sectionOf: Readonly<Record<Outcome['status'], Section>> = {
    due: 'due',
    closedNoCommit: 'decide',
    closedNotPlanned: 'decide',
    closedUnmerged: 'decide',
    noReleases: 'decide',
    waiting: 'waiting',
    unreleased: 'waiting',
    open: 'open',
    failed: 'failed',
};

const shortShaLength = 7;

const formatInstant = (instant: Temporal.Instant): string =>
    instant.toString({ smallestUnit: 'minute' });

const formatRelease = ({ tag, publishedAt }: Release): string =>
    `released in \`${tag}\` on ${formatInstant(publishedAt)}`;

const shortSha = (sha: string): string => `\`${sha.slice(0, shortShaLength)}\``;

/**
 * Describes each outcome, after the marker's condition, or `null` when the condition says it all.
 */
const describers: {
    readonly [Status in Outcome['status']]: (
        outcome: Extract<Outcome, { readonly status: Status }>
    ) => string | null;
} = {
    due: ({ release }) => (release ? formatRelease(release) : null),
    waiting: ({ dueAt, release }) => {
        const due = `due on ${formatInstant(dueAt)}`;
        return release ? `${formatRelease(release)}, ${due}` : due;
    },
    unreleased: ({ sha }) => `fixed by ${shortSha(sha)}, in no release yet`,
    open: () => null,
    noReleases: ({ sha }) =>
        `fixed by ${shortSha(sha)}, but the repository has no GitHub Releases to tell when it ships`,
    closedUnmerged: () => 'closed without merging',
    closedNotPlanned: () => 'closed as not planned',
    closedNoCommit: () =>
        'closed with no commit named: point the marker at the pull request that fixed it',
    failed: ({ error }) => error,
};

const formatEntry = ({ outcome, ...marker }: Resolved): string => {
    const condition =
        marker.condition.kind === 'date' ? marker.condition.date : marker.condition.url;
    const description = (describers[outcome.status] as (outcome: Outcome) => string | null)(
        outcome
    );
    const entry = `- \`${formatLocation(marker)}\` ${condition}`;
    return description === null ? entry : `${entry}: ${description}`;
};

/**
 * Renders the report as Markdown: a section per outcome, in order of urgency, each by path then line. Empty sections
 * are left out.
 *
 * @param resolved - every marker, by path then line
 * @param header - for the report's first line
 * @param header.now - the time the report is for
 * @param header.minAge - how old a release must be, as given
 * @returns Markdown, ending with a newline
 */
export const renderReport = (
    resolved: readonly Resolved[],
    { now, minAge }: { readonly now: Temporal.Instant; readonly minAge: string }
): string => {
    const lines = [
        '# drop-when report',
        '',
        `${plural(resolved.length, 'marker')}, at ${formatInstant(now)}, with a minimum release age of ${minAge}.`,
    ];
    for (const { section, heading } of sections) {
        const entries = resolved.filter(({ outcome }) => sectionOf[outcome.status] === section);
        if (entries.length > 0) {
            lines.push('', `## ${heading}`, '', ...entries.map(entry => formatEntry(entry)));
        }
    }
    return `${lines.join('\n')}\n`;
};

/**
 * Finds every marker and resolves it, for the `report` command.
 *
 * @param options - what to report on
 * @param dependencies - GitHub, and the time
 * @returns what to print, and the exit code: 1 when a lookup failed, or with `failOnDue` when a marker is due
 */
export const runReport = async (
    options: ReportOptions,
    { fetch, now, token }: ReportDependencies
): Promise<ReportResult> => {
    const minAge = parseMinAge(options.minAge);
    if (minAge === null) {
        return {
            stdout: '',
            stderr: `--min-age must be whole days or hours, like 7d or 12h, got "${options.minAge}"\n`,
            exitCode: 1,
        };
    }

    const scanned = await scan(options.cwd, options);
    if ('error' in scanned) {
        return { stdout: '', stderr: `${scanned.error}\n`, exitCode: 1 };
    }
    if (scanned.malformed.length > 0) {
        return { stdout: '', stderr: `${formatMalformed(scanned.malformed)}\n`, exitCode: 1 };
    }

    const github = new GitHub({ fetch, ...(token !== undefined && { token }) });
    const resolved = await Promise.all(
        scanned.markers.map(async marker => resolveMarker(github, marker, { minAge, now }))
    );

    const hasFailed = resolved.some(({ outcome }) => outcome.status === 'failed');
    const isAnyDue = resolved.some(({ outcome }) => outcome.status === 'due');
    return {
        stdout: renderReport(resolved, { now, minAge: options.minAge }),
        stderr: '',
        exitCode: hasFailed || (isAnyDue && options.failOnDue) ? 1 : 0,
    };
};
