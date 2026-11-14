import type { Probe, Scenario } from './scenarios.js';
import type { Compiled, Tool } from './tools.js';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { constants, gzip } from 'node:zlib';
import { build } from 'esbuild';
import { benchmarkScenario, purchaseOrder, scenarios, secretMarker } from './scenarios.js';
import { alternativeTools, xeneverTool } from './tools.js';
import { packageRoot, typeCheck } from './type-check.js';
import { literal, locationOf, messageOf, show } from './values.js';

/**
 * What one probe found for one tool. `n/a` is for a probe about reading an XSD, on a tool that reads none.
 */
export interface ProbeResult {
    readonly outcome: 'fail' | 'n/a' | 'pass';
    /**
     * What the tool did instead, when it failed.
     */
    readonly detail?: string;
}

/**
 * Size of what a tool needs at runtime to parse a document, bundled and minified.
 */
export type BundleResult =
    | { readonly error: string }
    | {
          readonly minified: number;
          readonly gzip: number;
          /**
           * Node.js built-in modules it imports, which a browser doesn't have.
           */
          readonly nodeBuiltins: readonly string[];
      };

/**
 * One tool's results.
 */
export interface ToolReport {
    readonly name: string;
    readonly packageName: string;
    readonly version: string;
    /**
     * Results in the order of the report's `probes`.
     */
    readonly probes: readonly ProbeResult[];
    /**
     * Why it couldn't load a scenario's schema, or why its types for it don't compile.
     */
    readonly errors: readonly { readonly feature: string; readonly message: string }[];
    readonly bundle: BundleResult;
    /**
     * Median milliseconds to parse the benchmark's purchase order, or why it couldn't.
     */
    readonly parse: { readonly error: string } | { readonly ms: number };
}

/**
 * The report the docs site shows.
 */
export interface Report {
    readonly generatedAt: string;
    readonly commit: string;
    readonly probes: readonly {
        readonly feature: string;
        readonly description: string;
        /**
         * Whether the probe is about reading an XSD.
         */
        readonly xsdOnly: boolean;
    }[];
    readonly benchmark: {
        readonly items: number;
        readonly bytes: number;
        readonly runs: number;
    };
    readonly tools: readonly ToolReport[];
}

/**
 * What a report needs that isn't one of its results.
 */
export interface ReportOptions {
    /**
     * Commit the tools ran at.
     */
    readonly commit: string;
    /**
     * When it ran, as an ISO 8601 string.
     */
    readonly generatedAt: string;
    /**
     * Tools to run, defaulting to xenever and its alternatives.
     */
    readonly tools?: readonly Tool[];
    /**
     * Items in the purchase order the benchmark parses.
     */
    readonly items?: number;
    /**
     * Times each tool parses it.
     */
    readonly runs?: number;
}

const defaultItems = 1000;
const defaultRuns = 15;

/**
 * Longest detail or error kept in the report, so one huge value doesn't swell it.
 */
const maxDetail = 300;
const truncate = (text: string): string =>
    text.length > maxDetail ? `${text.slice(0, maxDetail - 1)}…` : text;

const pass: ProbeResult = { outcome: 'pass' };
const fail = (detail: string): ProbeResult => ({ outcome: 'fail', detail: truncate(detail) });

type Parsed = { readonly error: unknown } | { readonly value: unknown };
type TypeProbe = Extract<Probe, { kind: 'type' }>;

/**
 * Parses a scenario's documents with a tool, each once.
 *
 * @param scenario - schema and documents
 * @param compiled - the tool, set up for the scenario
 * @returns what parsing a document by name gives
 */
const parser = (scenario: Scenario, compiled: Compiled): ((document: string) => Parsed) => {
    const cache = new Map<string, Parsed>();
    return document => {
        let result = cache.get(document);
        if (result === undefined) {
            try {
                result = { value: compiled.parse(scenario.documents[document]!) };
            } catch (error) {
                result = { error };
            }
            cache.set(document, result);
        }
        return result;
    };
};

type RuntimeProbe = Exclude<Probe, TypeProbe>;

/**
 * How each kind of probe that runs the parser, rather than the type checker, passes.
 */
const runtimeProbes: {
    readonly [Kind in RuntimeProbe['kind']]: (
        probe: Extract<RuntimeProbe, { kind: Kind }>,
        parsed: (document: string) => Parsed
    ) => ProbeResult;
} = {
    accepts: (probe, parsed) => {
        const result = parsed(probe.document);
        return 'value' in result ? pass : fail(`rejected it: ${messageOf(result.error)}`);
    },
    rejects: (probe, parsed) => {
        const result = parsed(probe.document);
        return 'error' in result ? pass : fail(`accepted it as ${show(result.value)}`);
    },
    value: (probe, parsed) => {
        const result = parsed(probe.document);
        if ('error' in result) {
            return probe.rejectionPasses === true
                ? pass
                : fail(`rejected it: ${messageOf(result.error)}`);
        }
        const found = probe.check(result.value);
        return found === true ? pass : fail(found);
    },
    same: (probe, parsed) => {
        const results = probe.documents.map(document => parsed(document));
        const rejected = results.find(result => 'error' in result);
        if (rejected) {
            return fail(`rejected one: ${messageOf(rejected.error)}`);
        }
        const shown = results.map(result => show((result as { value: unknown }).value));
        return shown.every(value => value === shown[0])
            ? pass
            : fail(`read them as ${shown.join(' and ')}`);
    },
    location: (probe, parsed) => {
        const result = parsed(probe.document);
        if ('value' in result) {
            return fail('accepted it');
        }
        return probe.check(locationOf(result.error)) ? pass : fail(messageOf(result.error));
    },
};

/**
 * Whether a probe that runs the parser passes.
 *
 * @param probe - any probe but a type probe
 * @param parsed - parses a document of the scenario by name
 * @returns its result
 */
const runtimeProbe = (probe: RuntimeProbe, parsed: (document: string) => Parsed): ProbeResult =>
    (
        runtimeProbes[probe.kind] as (
            probe: RuntimeProbe,
            parsed: (document: string) => Parsed
        ) => ProbeResult
    )(probe, parsed);

/**
 * What a type probe checks: a value, or why there is none to check.
 */
type TypeCheck = { readonly rejects: boolean } & (
    | { readonly missing: string }
    | { readonly value: unknown }
);

/**
 * A scenario run on a tool, with its type probes still to check.
 */
interface ScenarioRun {
    /**
     * Results in the scenario's order. Type probes hold a placeholder until they are checked.
     */
    readonly results: ProbeResult[];
    readonly error?: string;
    readonly types?: {
        readonly source: string;
        /**
         * Positions of the type probes in `results`, and what each checks.
         */
        readonly indexes: readonly number[];
        readonly checks: readonly TypeCheck[];
    };
}

/**
 * What a type probe checks, given the parsed value of the scenario's subject document.
 *
 * @param probe - a probe of the tool's type
 * @param subject - the subject document, parsed
 * @returns the value to check, or why there is none
 */
const typeCheckOf = (probe: TypeProbe, subject: Parsed): TypeCheck => {
    if ('error' in subject) {
        return {
            rejects: probe.rejects,
            missing: `couldn't parse the document: ${messageOf(subject.error)}`,
        };
    }
    const value = probe.value ? probe.value(subject.value) : subject.value;
    return value === undefined
        ? { rejects: probe.rejects, missing: 'the parsed value has nothing to change' }
        : { rejects: probe.rejects, value };
};

/**
 * Run a scenario's probes on a tool, apart from type-checking.
 *
 * @param tool - tool to run
 * @param scenario - schema, documents and probes
 * @returns its results so far
 */
const runScenario = async (tool: Tool, scenario: Scenario): Promise<ScenarioRun> => {
    if (scenario.xsdOnly === true && !tool.readsXsd) {
        return { results: scenario.probes.map(() => ({ outcome: 'n/a' })) };
    }
    let compiled: Compiled;
    try {
        compiled = await tool.compile(scenario);
    } catch (error) {
        return {
            results: scenario.probes.map(() =>
                fail(`couldn't load the schema: ${messageOf(error)}`)
            ),
            error: messageOf(error),
        };
    }
    const parsed = parser(scenario, compiled);
    const indexes = scenario.probes
        .keys()
        .filter(index => scenario.probes[index]!.kind === 'type')
        .toArray();
    return {
        results: scenario.probes.map(probe =>
            probe.kind === 'type' ? pass : runtimeProbe(probe, parsed)
        ),
        types: {
            indexes,
            source: compiled.types,
            checks: indexes.map(index =>
                typeCheckOf(scenario.probes[index] as TypeProbe, parsed(scenario.subject))
            ),
        },
    };
};

/**
 * Source checking one value against the type, which fails to compile only on its own line.
 *
 * @param check - what the probe checks
 * @returns a line of TypeScript, empty when there is nothing to check
 */
const typeProbeLine = (check: TypeCheck): string =>
    'value' in check ? `{ const _value: Subject = ${literal(check.value)}; }` : '';

/**
 * Check the type probes of a tool's scenarios in one program, since starting the checker is most of the cost.
 *
 * @param list - every scenario
 * @param runs - each scenario run on the tool, whose type probes' results are filled in
 * @returns errors in the types
 * @throws {Error} when the probes can't import the types, which would make every value pass
 */
const checkTypes = (
    list: readonly Scenario[],
    runs: readonly ScenarioRun[]
): { feature: string; message: string }[] => {
    const pending: {
        scenario: Scenario;
        results: ProbeResult[];
        types: NonNullable<ScenarioRun['types']>;
    }[] = [];
    for (const [index, { results, types }] of runs.entries()) {
        if (types && types.indexes.length > 0) {
            pending.push({ scenario: list[index]!, results, types });
        }
    }
    const diagnostics = typeCheck(
        Object.fromEntries(
            pending.flatMap(({ scenario, types }) => [
                [`${scenario.id}/generated.ts`, types.source],
                [
                    `${scenario.id}/probes.ts`,
                    [
                        "import type { Subject } from './generated.js';",
                        ...types.checks.map(check => typeProbeLine(check)),
                    ].join('\n'),
                ],
            ])
        )
    );
    const errors: { feature: string; message: string }[] = [];
    for (const { scenario, results, types } of pending) {
        const typeErrors = diagnostics[`${scenario.id}/generated.ts`]!;
        const message = typeErrors.map(({ message: text }) => text).join('; ');
        const byLine = Map.groupBy(diagnostics[`${scenario.id}/probes.ts`]!, ({ line }) => line);
        if (typeErrors.length > 0) {
            errors.push({ feature: scenario.feature, message: `types don't compile: ${message}` });
        } else if (byLine.has(0)) {
            // The import of `Subject` failing would make every value pass, so it is the comparison's own bug
            throw new Error(`Type probes can't import their types: ${show(byLine.get(0))}`);
        }
        for (const [position, check] of types.checks.entries()) {
            const failed = byLine.get(position + 1);
            let result = pass;
            if (typeErrors.length > 0) {
                result = fail(`its types don't compile: ${message}`);
            } else if ('missing' in check) {
                result = fail(check.missing);
            } else if (check.rejects) {
                result = failed ? pass : fail('the type accepts it');
            } else if (failed) {
                result = fail(failed.map(({ message: text }) => text).join('; '));
            }
            results[types.indexes[position]!] = result;
        }
    }
    return errors;
};

/**
 * Run every scenario's probes on one tool.
 *
 * @param tool - tool to run
 * @param list - every scenario
 * @returns each probe's result, in order, and the errors behind failures
 */
const runScenarios = async (
    tool: Tool,
    list: readonly Scenario[]
): Promise<Pick<ToolReport, 'errors' | 'probes'>> => {
    const runs: ScenarioRun[] = [];
    for (const scenario of list) {
        runs.push(await runScenario(tool, scenario));
    }
    const errors: { feature: string; message: string }[] = [];
    for (const [index, { error }] of runs.entries()) {
        if (error !== undefined) {
            errors.push({ feature: list[index]!.feature, message: error });
        }
    }
    errors.push(...checkTypes(list, runs));
    return { errors, probes: runs.flatMap(({ results }) => results) };
};

/**
 * Bundle what a tool needs at runtime, as an app would.
 *
 * @param tool - tool to bundle
 * @returns its sizes, or why it couldn't be bundled
 */
const bundleSize = async (tool: Tool): Promise<BundleResult> => {
    try {
        const { outputFiles, metafile } = await build({
            stdin: { contents: tool.runtime, resolveDir: packageRoot, loader: 'js' },
            bundle: true,
            minify: true,
            format: 'esm',
            // Built-ins stay imports, which are listed, rather than failing the build
            platform: 'node',
            write: false,
            metafile: true,
            logLevel: 'silent',
        });
        const [output] = Object.values(metafile.outputs);
        const code = outputFiles[0]!.contents;
        const gzipped = await promisify(gzip)(code, { level: constants.Z_BEST_COMPRESSION });
        return {
            minified: code.byteLength,
            gzip: gzipped.byteLength,
            nodeBuiltins: [
                ...new Set(
                    output!.imports
                        .filter(({ external }) => external === true)
                        .map(({ path }) => path.replace(/^node:/v, ''))
                ),
            ].toSorted((a, b) => a.localeCompare(b)),
        };
    } catch (error) {
        return { error: truncate(messageOf(error)) };
    }
};

/**
 * Time a tool parsing the benchmark's purchase order, after one run to warm up.
 *
 * @param tool - tool to time
 * @param items - items in the order
 * @param runs - times to parse it
 * @returns median milliseconds, or why it couldn't
 */
const timeParse = async (tool: Tool, items: number, runs: number): Promise<ToolReport['parse']> => {
    const scenario = benchmarkScenario(items);
    try {
        const { parse } = await tool.compile(scenario);
        const document = scenario.documents.order!;
        parse(document);
        const times: number[] = [];
        for (let run = 0; run < runs; run++) {
            const start = performance.now();
            parse(document);
            times.push(performance.now() - start);
        }
        return { ms: times.toSorted((a, b) => a - b)[Math.floor(runs / 2)]! };
    } catch (error) {
        return { error: truncate(messageOf(error)) };
    }
};

const versionOf = async (packageName: string): Promise<string> => {
    const packageJson = await readFile(
        Path.join(packageRoot, 'node_modules', packageName, 'package.json'),
        'utf8'
    );
    return (JSON.parse(packageJson) as { version: string }).version;
};

/**
 * Run every tool through the scenarios, the bundle and the benchmark. A probe failing, or a tool crashing, is a
 * result: only a problem with the comparison itself throws.
 *
 * @param options - what it needs beyond the results
 * @returns report to publish
 */
export const createReport = async ({
    commit,
    generatedAt,
    tools = [xeneverTool, ...alternativeTools],
    items = defaultItems,
    runs = defaultRuns,
}: ReportOptions): Promise<Report> => {
    // Files the security documents point at, which a safe parser never reads
    const directory = await mkdtemp(Path.join(tmpdir(), 'xenever-comparison-'));
    const secret = Path.join(directory, 'secret.txt');
    const dtd = Path.join(directory, 'secret.dtd');
    await writeFile(secret, secretMarker);
    await writeFile(dtd, `<!ENTITY secret "${secretMarker}">\n`);
    const list = scenarios({ secret, dtd });

    const results: ToolReport[] = [];
    try {
        // One at a time, since the benchmark in each would compete with the others
        for (const tool of tools) {
            results.push({
                name: tool.name,
                packageName: tool.packageName,
                version: await versionOf(tool.packageName),
                ...(await runScenarios(tool, list)),
                bundle: await bundleSize(tool),
                parse: await timeParse(tool, items, runs),
            });
        }
    } finally {
        await rm(directory, { recursive: true });
    }
    return {
        commit,
        generatedAt,
        probes: list.flatMap(({ feature, probes, xsdOnly = false }) =>
            probes.map(({ description }) => ({ feature, description, xsdOnly }))
        ),
        benchmark: { items, runs, bytes: Buffer.byteLength(purchaseOrder({ items })) },
        tools: results,
    };
};

/**
 * Run the report, and write it to a file.
 *
 * @param path - where to write it
 * @param options - what it needs beyond the results
 */
export const writeReport = async (path: string, options: ReportOptions): Promise<void> => {
    const report = await createReport(options);
    await mkdir(Path.dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
};

/**
 * What a report run from the command line says about itself.
 *
 * @returns the time now, and the commit CI gave in `COMPARISON_COMMIT`, since Dagger's source has no `.git`
 */
export const environmentOptions = (): ReportOptions => ({
    // eslint-disable-next-line n/no-process-env -- The only way CI can say which commit it is
    commit: process.env.COMPARISON_COMMIT ?? 'local',
    // eslint-disable-next-line unicorn/prefer-temporal, unicorn/no-unreadable-new-expression -- Temporal isn't in the Node version this runs on
    generatedAt: new Date().toISOString(),
});
