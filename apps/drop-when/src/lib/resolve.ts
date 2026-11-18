import type { GitHub } from './github.js';
import type { Marker, ReleasedCondition } from './marker.js';

/**
 * The first release whose tag contains the fix.
 */
export interface Release {
    readonly tag: string;
    readonly publishedAt: Temporal.Instant;
}

/**
 * What a marker's condition comes to, now:
 *
 * - `due`: drop the workaround. The date has come, or the fix's release is old enough.
 * - `waiting`: due later, on the date or once the fix's release is old enough.
 * - `unreleased`: fixed upstream, in no release yet.
 * - `open`: upstream is still open.
 * - `noReleases`: fixed upstream, in a repository with no GitHub Releases to tell when it ships.
 * - `closedUnmerged`: the pull request was closed without merging.
 * - `closedNotPlanned`: the issue was closed as not planned, or as a duplicate.
 * - `closedNoCommit`: the issue was closed with no commit named, by hand or by merging a pull request.
 * - `failed`: a request to GitHub failed.
 */
export type Outcome =
    | { readonly status: 'closedNoCommit' | 'closedNotPlanned' | 'closedUnmerged' }
    | { readonly status: 'due'; readonly release?: Release }
    | { readonly status: 'failed'; readonly error: string }
    | { readonly status: 'noReleases'; readonly sha: string }
    | { readonly status: 'open' }
    | { readonly status: 'unreleased'; readonly sha: string }
    | { readonly status: 'waiting'; readonly dueAt: Temporal.Instant; readonly release?: Release };

export type Resolved = Marker & { readonly outcome: Outcome };

/**
 * How old a release must be, and when it is now.
 */
export interface Timing {
    readonly minAge: Temporal.Duration;
    readonly now: Temporal.Instant;
}

interface PullResponse {
    readonly state: 'closed' | 'open';
    readonly merged_at: string | null;
    readonly merge_commit_sha: string | null;
}

interface IssueResponse {
    readonly state: 'closed' | 'open';
    readonly state_reason: string | null;
    readonly pull_request?: unknown;
}

interface TimelineEvent {
    readonly event: string;
    readonly commit_id?: string | null;
    readonly created_at?: string;
}

interface ReleaseResponse {
    readonly tag_name: string;
    readonly draft: boolean;
    readonly prerelease: boolean;
    readonly published_at: string | null;
}

interface CompareResponse {
    readonly status: 'ahead' | 'behind' | 'diverged' | 'identical';
}

interface Fix {
    readonly sha: string;
    /**
     * When it was merged or closed the issue. No release before then can contain it.
     */
    readonly at: Temporal.Instant;
}

type FixOutcome =
    | Extract<
          Outcome,
          {
              readonly status: 'closedNoCommit' | 'closedNotPlanned' | 'closedUnmerged' | 'open';
          }
      >
    | { readonly status: 'fixed'; readonly fix: Fix };

const repoPath = ({ owner, repo }: ReleasedCondition): string => `/repos/${owner}/${repo}`;

const resolvePull = async (github: GitHub, condition: ReleasedCondition): Promise<FixOutcome> => {
    const pull = await github.get<PullResponse>(`${repoPath(condition)}/pulls/${condition.number}`);
    if (pull.merged_at !== null) {
        return {
            status: 'fixed',
            fix: { sha: pull.merge_commit_sha!, at: Temporal.Instant.from(pull.merged_at) },
        };
    }
    return { status: pull.state === 'open' ? 'open' : 'closedUnmerged' };
};

/**
 * An issue is fixed by the commit its last `closed` event names. GitHub names none when the issue was closed by hand,
 * or by merging a pull request, so the marker should name that pull request instead. Cross-references are never
 * guessed from.
 *
 * @param github - client
 * @param condition - an issue URL, which GitHub also answers for a pull request
 * @returns the fix, or why there is none
 */
const resolveIssue = async (github: GitHub, condition: ReleasedCondition): Promise<FixOutcome> => {
    const path = `${repoPath(condition)}/issues/${condition.number}`;
    const issue = await github.get<IssueResponse>(path);
    if (issue.pull_request !== undefined) {
        return resolvePull(github, condition);
    }
    if (issue.state === 'open') {
        return { status: 'open' };
    }
    if (issue.state_reason === 'not_planned' || issue.state_reason === 'duplicate') {
        return { status: 'closedNotPlanned' };
    }

    const timeline = await github.getAll<TimelineEvent>(`${path}/timeline?per_page=100`);
    const closed = timeline.findLast(({ event }) => event === 'closed');
    if (typeof closed?.commit_id !== 'string') {
        return { status: 'closedNoCommit' };
    }
    return {
        status: 'fixed',
        fix: { sha: closed.commit_id, at: Temporal.Instant.from(closed.created_at!) },
    };
};

/**
 * Finds the first release containing the fix: of the releases published after it (neither drafts nor prereleases),
 * oldest first, the first whose tag the fix is an ancestor of.
 *
 * @param github - client
 * @param condition - the repository
 * @param fix - the commit
 * @returns the release, or why there is none
 */
const findRelease = async (
    github: GitHub,
    condition: ReleasedCondition,
    fix: Fix
): Promise<Extract<Outcome, { readonly status: 'noReleases' | 'unreleased' }> | Release> => {
    const isRelease = ({ draft, prerelease }: ReleaseResponse): boolean => !draft && !prerelease;
    // GitHub lists releases newest first, so once a page holds a release published before the fix, no later page
    // holds one published after it: https://docs.github.com/en/rest/releases/releases#list-releases
    const listed = await github.getAll<ReleaseResponse>(
        `${repoPath(condition)}/releases?per_page=100`,
        page =>
            page.some(
                release =>
                    isRelease(release) &&
                    Temporal.Instant.compare(Temporal.Instant.from(release.published_at!), fix.at) <
                        0
            )
    );
    const releases = listed.filter(release => isRelease(release));
    if (releases.length === 0) {
        return { status: 'noReleases', sha: fix.sha };
    }

    const candidates = releases
        .map(release => ({
            tag: release.tag_name,
            publishedAt: Temporal.Instant.from(release.published_at!),
        }))
        .filter(({ publishedAt }) => Temporal.Instant.compare(publishedAt, fix.at) >= 0)
        .toSorted(
            (a, b) =>
                Temporal.Instant.compare(a.publishedAt, b.publishedAt) ||
                Number(a.tag > b.tag) - Number(a.tag < b.tag)
        );

    for (const candidate of candidates) {
        // Oldest first, stopping at the first that contains the fix
        const { status } = await github.get<CompareResponse>(
            `${repoPath(condition)}/compare/${encodeURIComponent(candidate.tag)}...${fix.sha}?per_page=1`
        );
        // The fix is behind the tag (or is the tag's commit), so the tag contains it
        if (status === 'behind' || status === 'identical') {
            return candidate;
        }
    }
    return { status: 'unreleased', sha: fix.sha };
};

const resolveReleased = async (
    github: GitHub,
    condition: ReleasedCondition,
    { minAge, now }: Timing
): Promise<Outcome> => {
    const fixed = await (condition.type === 'pull'
        ? resolvePull(github, condition)
        : resolveIssue(github, condition));
    if (fixed.status !== 'fixed') {
        return fixed;
    }

    const release = await findRelease(github, condition, fixed.fix);
    if ('status' in release) {
        return release;
    }
    const dueAt = release.publishedAt.add(minAge);
    return Temporal.Instant.compare(dueAt, now) <= 0
        ? { status: 'due', release }
        : { status: 'waiting', dueAt, release };
};

/**
 * Resolves what a marker's condition comes to now.
 *
 * @param github - client, shared by every marker of a run
 * @param marker - where it is, and its condition
 * @param timing - how old a release must be, and when it is now
 * @returns the marker, with its outcome. A failed request is an outcome too, so one marker never hides the others
 */
export const resolveMarker = async (
    github: GitHub,
    marker: Marker,
    timing: Timing
): Promise<Resolved> => {
    const { condition } = marker;
    if (condition.kind === 'date') {
        const dueAt = Temporal.PlainDate.from(condition.date).toZonedDateTime('UTC').toInstant();
        return {
            ...marker,
            outcome:
                Temporal.Instant.compare(dueAt, timing.now) <= 0
                    ? { status: 'due' }
                    : { status: 'waiting', dueAt },
        };
    }

    try {
        return { ...marker, outcome: await resolveReleased(github, condition, timing) };
    } catch (error) {
        return { ...marker, outcome: { status: 'failed', error: (error as Error).message } };
    }
};
