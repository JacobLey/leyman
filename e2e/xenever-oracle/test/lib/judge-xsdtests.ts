import type { TestResult } from './run-xsdtests.js';

/**
 * Tests where xenever, xmllint and the suite do not all agree, for one reason.
 */
export interface ExpectedDisagreement {
    readonly name: string;
    /**
     * Whose the disagreement is: a bug of libxml2, a deliberate strictness of xenever, xenever following a
     * later revision where XSD 1.0 differs (XSD 1.1, or the current `xml.xsd` the schema for schemas imports),
     * or a gap of xenever deferred to a later version.
     */
    readonly kind: 'gap' | 'libxml2' | 'revision' | 'strictness';
    readonly reason: string;
    /**
     * Link to the section of the specification the reason rests on.
     */
    readonly spec: string;
    readonly ids: readonly string[];
}

/**
 * Something xenever doesn't support yet, by the message of its `XeneverUnsupportedError`.
 */
export interface Limit {
    readonly pattern: RegExp;
    readonly reason: string;
}

/**
 * How the tests came out.
 */
export interface Judgement {
    /**
     * Tests inside xenever's subset, of which: those where xenever, xmllint and the suite agree; those
     * xenever reported as one of its limits; and those listed as expected disagreements.
     */
    readonly counts: {
        readonly inSubset: number;
        readonly passed: number;
        readonly unsupported: number;
        readonly expectedDisagreement: number;
        readonly outsideSubset: number;
    };
    /**
     * Expected disagreements by name, with how many tests each covered.
     */
    readonly byDisagreement: ReadonlyMap<string, number>;
    /**
     * A line per test that came out otherwise than allowed.
     */
    readonly failures: readonly string[];
}

/**
 * A test as the judgement counts it, and what is wrong with it, if anything.
 */
interface Verdict {
    readonly count: 'disagreement' | 'outside' | 'passed' | 'unsupported';
    readonly failure?: string;
}

/**
 * One line about a test, for a failure.
 *
 * @param result - the test
 * @returns its id and outcomes
 */
const describeResult = (result: TestResult): string => {
    const message = result.message === undefined ? '' : ` (${result.message.split('\n', 1)[0]!})`;
    return `${result.id}: suite ${result.expected}, xenever ${result.xenever}, xmllint ${result.xmllint ?? 'not run'}${message}`;
};

/**
 * Judges one test.
 *
 * @param result - the test
 * @param name - the expected disagreement it is listed under, if any
 * @param limits - xenever's limits
 * @returns the verdict
 */
const judgeOne = (
    result: TestResult,
    name: string | undefined,
    limits: readonly Limit[]
): Verdict => {
    if (result.outside.length > 0) {
        const isAllowed =
            result.xenever === 'unsupported' ||
            (result.kind === 'schema'
                ? result.xenever === 'invalid' && result.expected === 'invalid'
                : result.xenever === result.expected);
        return isAllowed
            ? { count: 'outside' }
            : {
                  count: 'outside',
                  failure: `outside the subset (${result.outside.join(', ')}): ${describeResult(result)}`,
              };
    }
    if (result.xenever === 'unsupported') {
        return limits.some(limit => limit.pattern.test(result.message ?? ''))
            ? { count: 'unsupported' }
            : {
                  count: 'unsupported',
                  failure: `unsupported, but not a known limit: ${describeResult(result)}`,
              };
    }
    const isAccepted = result.xenever === 'valid';
    const isAgreed =
        isAccepted === (result.expected === 'valid') && isAccepted === (result.xmllint === 'valid');
    if (isAgreed) {
        return name === undefined
            ? { count: 'passed' }
            : {
                  count: 'passed',
                  failure: `listed under ${name}, but agrees: ${describeResult(result)}`,
              };
    }
    return name === undefined
        ? { count: 'disagreement', failure: `disagrees: ${describeResult(result)}` }
        : { count: 'disagreement' };
};

/**
 * Judges the results of the suite: inside xenever's subset, xenever must agree with both xmllint and the
 * suite, report one of its limits, or be listed as an expected disagreement; outside it, xenever must report
 * the schema as unsupported (or invalid, where the suite agrees), and an instance as unsupported or as the
 * suite expects. Every listed disagreement must still disagree.
 *
 * @param results - a result per test
 * @param expected - the expected disagreements
 * @param limits - xenever's limits
 * @returns the counts, and any failures
 */
export const judgeXsdTests = (
    results: readonly TestResult[],
    expected: readonly ExpectedDisagreement[],
    limits: readonly Limit[]
): Judgement => {
    const listed = new Map<string, string>();
    for (const disagreement of expected) {
        for (const id of disagreement.ids) {
            listed.set(id, disagreement.name);
        }
    }
    const byDisagreement = new Map<string, number>();
    const counts = { disagreement: 0, outside: 0, passed: 0, unsupported: 0 };
    const seen = new Set<string>();
    const failures: string[] = [];
    for (const result of results) {
        const name = listed.get(result.id);
        const verdict = judgeOne(result, name, limits);
        counts[verdict.count]++;
        if (verdict.failure !== undefined) {
            failures.push(verdict.failure);
        }
        if (name === undefined || verdict.count === 'outside') {
            continue;
        }

        seen.add(result.id);
        if (verdict.count === 'disagreement') {
            byDisagreement.set(name, (byDisagreement.get(name) ?? 0) + 1);
        }
    }
    for (const [id, name] of listed) {
        if (!seen.has(id)) {
            failures.push(`listed under ${name}, but not run inside the subset: ${id}`);
        }
    }
    return {
        counts: {
            inSubset: counts.passed + counts.unsupported + counts.disagreement,
            passed: counts.passed,
            unsupported: counts.unsupported,
            expectedDisagreement: counts.disagreement,
            outsideSubset: counts.outside,
        },
        byDisagreement,
        failures,
    };
};
