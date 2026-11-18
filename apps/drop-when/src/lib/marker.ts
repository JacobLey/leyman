/**
 * The token that starts a marker, wherever it is on a line, so it works in any comment syntax.
 */
export const markerToken = 'drop-when:';

/**
 * A GitHub issue or pull request whose fix must be released.
 */
export interface ReleasedCondition {
    readonly kind: 'released';
    readonly url: string;
    readonly owner: string;
    readonly repo: string;
    readonly type: 'issues' | 'pull';
    readonly number: number;
}

/**
 * A day (UTC), from which the marker is due.
 */
export interface DateCondition {
    readonly kind: 'date';
    /**
     * As written, `YYYY-MM-DD`.
     */
    readonly date: string;
}

export type Condition = DateCondition | ReleasedCondition;

/**
 * Where a marker was found.
 */
export interface Location {
    /**
     * As `git ls-files` printed it, relative to where it ran.
     */
    readonly path: string;
    /**
     * 1-based.
     */
    readonly line: number;
}

export interface Marker extends Location {
    readonly condition: Condition;
}

export interface MalformedMarker extends Location {
    /**
     * What is wrong, and what is expected instead.
     */
    readonly problem: string;
}

export interface ParsedMarkers {
    readonly markers: readonly Marker[];
    readonly malformed: readonly MalformedMarker[];
}

const datePattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/v;
const urlPattern =
    /^https:\/\/github\.com\/(?<owner>[\w\-.]+)\/(?<repo>[\w\-.]+)\/(?<type>issues|pull)\/(?<number>[1-9]\d*)$/v;
const expected = 'expected "released <GitHub issue or pull request URL>" or a date (YYYY-MM-DD)';

/**
 * Parses a day, which must exist: `2026-02-30` does not.
 *
 * @param date - the text after the token
 * @returns the condition, or what is wrong with it, or `null` when it isn't shaped like a date
 */
const parseDate = (date: string): DateCondition | { readonly problem: string } | null => {
    const groups = datePattern.exec(date)?.groups;
    if (!groups) {
        return null;
    }
    // Constraining a day that doesn't exist moves it to one that does, so it no longer prints the same
    const day = Temporal.PlainDate.from({
        year: Number(groups.year),
        month: Number(groups.month),
        day: Number(groups.day),
    });
    return day.toString() === date ? { kind: 'date', date } : { problem: `${date} is not a day` };
};

/**
 * Parses the condition after one marker token: `released` and a URL, or a date. Whitespace separates its words,
 * and anything after it is ignored, so a marker can end a comment line, and a comment closes after a space
 * (`<!-- drop-when: 2026-11-25 -->`).
 *
 * @param rest - the line after the token
 * @returns the condition, or what is wrong with it
 */
const parseCondition = (rest: string): Condition | { readonly problem: string } => {
    const [first = '', second = ''] = rest.trim().split(/\s+/v, 2);

    if (first === 'released') {
        const url = urlPattern.exec(second)?.groups;
        if (!url) {
            return {
                problem: `"released" needs a GitHub issue or pull request URL (https://github.com/<owner>/<repo>/issues/<number> or /pull/<number>), got "${second}"`,
            };
        }
        return {
            kind: 'released',
            url: second,
            owner: url.owner!,
            repo: url.repo!,
            type: url.type as ReleasedCondition['type'],
            number: Number(url.number),
        };
    }

    return parseDate(first) ?? { problem: `${expected}, got "${first}"` };
};

/**
 * Finds every marker in a file's text. Each occurrence of the token is a marker, even several on one line.
 *
 * @param path - the file, for the locations
 * @param text - its contents
 * @returns markers in the order they appear, and the malformed ones
 */
export const parseMarkers = (path: string, text: string): ParsedMarkers => {
    const markers: Marker[] = [];
    const malformed: MalformedMarker[] = [];

    for (const [index, content] of text.split('\n').entries()) {
        const line = index + 1;
        let at = content.indexOf(markerToken);
        while (at !== -1) {
            const end = at + markerToken.length;
            const parsed = parseCondition(content.slice(end));
            if ('problem' in parsed) {
                malformed.push({ path, line, problem: parsed.problem });
            } else {
                markers.push({ path, line, condition: parsed });
            }
            at = content.indexOf(markerToken, end);
        }
    }

    return { markers, malformed };
};
