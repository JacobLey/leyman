import type { Probe } from './probes.js';
import type { Generate, Tool } from './tools.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { performance } from 'node:perf_hooks';
import { jsonSchema, largeJsonSchema, largeOpenApiDocument, openApiDocument } from './documents.js';
import { jsonSchemaProbes, openApiProbes } from './probes.js';
import { alternativeTools, geneverTool } from './tools.js';
import { packageRoot, typeCheck } from './type-check.js';

const suiteIds = ['jsonSchema', 'openApi'] as const;
type SuiteId = (typeof suiteIds)[number];

/**
 * What a tool did with one kind of document. A tool failing is a result like any other, so it never throws.
 */
export interface SuiteResult {
    /**
     * Why the tool produced nothing, in which case every probe failed.
     */
    readonly error?: string;
    /**
     * Errors in what it generated, such as a type too deep to instantiate.
     */
    readonly typeErrors: readonly string[];
    /**
     * Whether each probe passed, in the suite's order.
     */
    readonly probes: readonly boolean[];
    /**
     * Median milliseconds to generate from the large document, for a tool that is timed.
     */
    readonly generateMs?: number;
    /**
     * Why it couldn't generate from the large document.
     */
    readonly generateError?: string;
}

/**
 * The report the docs site shows.
 */
export interface Report {
    readonly generatedAt: string;
    readonly commit: string;
    readonly suites: Readonly<Record<SuiteId, readonly Pick<Probe, 'description' | 'feature'>[]>>;
    readonly benchmark: { readonly definitions: number; readonly runs: number };
    readonly tools: readonly {
        readonly name: string;
        readonly packageName: string;
        readonly version: string;
        readonly results: Partial<Record<SuiteId, SuiteResult>>;
    }[];
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
     * Tools to run, defaulting to genever and its alternatives.
     */
    readonly tools?: readonly Tool[];
    /**
     * Definitions in the document timed.
     */
    readonly definitions?: number;
    /**
     * Times each tool generates from it.
     */
    readonly runs?: number;
}

const defaultDefinitions = 500;
const defaultRuns = 5;

const suites: Readonly<
    Record<
        SuiteId,
        { document: object; probes: readonly Probe[]; large: (definitions: number) => object }
    >
> = {
    jsonSchema: { document: jsonSchema, probes: jsonSchemaProbes, large: largeJsonSchema },
    openApi: { document: openApiDocument, probes: openApiProbes, large: largeOpenApiDocument },
};

const messageOf = (error: unknown): string =>
    Error.isError(error) ? error.message : String(error);

/**
 * Source of the file holding one line per probe, each failing or not on its own.
 *
 * @param probes - probes to check
 * @returns the lines before the probes, and the source
 */
const probeSource = (probes: readonly Probe[]): { offset: number; source: string } => {
    const header = [
        "import type { Subject } from './generated.js';",
        'type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;',
    ];
    return {
        offset: header.length,
        // Each probe's names stay in its own block, so one probe can't affect another
        source: [...header, ...probes.map(({ code }) => `{ ${code} }`)].join('\n'),
    };
};

/**
 * Run a suite's probes against generated source.
 *
 * @param source - generated source
 * @param probes - probes to check
 * @returns whether each passed, and any errors in the source itself
 */
const runProbes = (
    source: string,
    probes: readonly Probe[]
): Pick<SuiteResult, 'probes' | 'typeErrors'> => {
    const { offset, source: probesFile } = probeSource(probes);
    const diagnostics = typeCheck({
        'generated.ts': source,
        'generated-probes.ts': probesFile,
    });
    const failedLines = new Set(diagnostics['generated-probes.ts']!.map(({ line }) => line));
    return {
        typeErrors: diagnostics['generated.ts']!.map(({ message }) => message),
        probes: probes.map(({ rejects }, index) => failedLines.has(offset + index) === rejects),
    };
};

/**
 * Time a tool generating from a large document.
 *
 * @param generate - the tool
 * @param document - document to generate from
 * @param runs - times to run
 * @returns median milliseconds, or why it failed
 */
const timeGenerate = async (
    generate: Generate,
    document: object,
    runs: number
): Promise<Pick<SuiteResult, 'generateError' | 'generateMs'>> => {
    try {
        const times: number[] = [];
        for (let run = 0; run < runs; run++) {
            const start = performance.now();
            await generate(document);
            times.push(performance.now() - start);
        }
        return { generateMs: times.toSorted((a, b) => a - b)[Math.floor(runs / 2)]! };
    } catch (error) {
        return { generateError: messageOf(error) };
    }
};

const runSuite = async (
    tool: Tool,
    id: SuiteId,
    definitions: number,
    runs: number
): Promise<SuiteResult | undefined> => {
    const generate = tool[id];
    if (!generate) {
        return undefined;
    }
    const { document, probes, large } = suites[id];
    let source: string;
    try {
        source = await generate(document);
    } catch (error) {
        return { error: messageOf(error), typeErrors: [], probes: probes.map(() => false) };
    }
    return {
        ...runProbes(source, probes),
        ...(tool.timed && (await timeGenerate(generate, large(definitions), runs))),
    };
};

const versionOf = async (packageName: string): Promise<string> => {
    const packageJson = await readFile(
        Path.join(packageRoot, 'node_modules', packageName, 'package.json'),
        'utf8'
    );
    return (JSON.parse(packageJson) as { version: string }).version;
};

/**
 * Run every tool through the probes and the benchmark. A probe failing, or a tool crashing, is a result: only a problem
 * with the comparison itself throws.
 *
 * @param options - what it needs beyond the results
 * @returns report to publish
 */
export const createReport = async ({
    commit,
    generatedAt,
    tools = [geneverTool, ...alternativeTools],
    definitions = defaultDefinitions,
    runs = defaultRuns,
}: ReportOptions): Promise<Report> => {
    const results: Report['tools'][number][] = [];
    // One at a time, since the benchmark in each would compete with the others
    for (const tool of tools) {
        const toolResults: Partial<Record<SuiteId, SuiteResult>> = {};
        for (const id of suiteIds) {
            const result = await runSuite(tool, id, definitions, runs);
            if (result) {
                toolResults[id] = result;
            }
        }
        results.push({
            name: tool.name,
            packageName: tool.packageName,
            version: await versionOf(tool.packageName),
            results: toolResults,
        });
    }
    return {
        commit,
        generatedAt,
        suites: {
            jsonSchema: jsonSchemaProbes.map(({ feature, description }) => ({
                feature,
                description,
            })),
            openApi: openApiProbes.map(({ feature, description }) => ({ feature, description })),
        },
        benchmark: { definitions, runs },
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
