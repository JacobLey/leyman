import type { Context } from 'mocha';
import type { Tool } from '@leyman/e2e-genever-comparison';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { promisify } from 'node:util';
import {
    alternativeTools,
    createReport,
    environmentOptions,
    geneverTool,
    jsonSchema as jsonSchemaDocument,
    jsonSchemaProbes,
    openApiProbes,
    writeReport,
} from '@leyman/e2e-genever-comparison';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

const options = {
    commit: 'abc',
    generatedAt: '2026-11-02T00:00:00.000Z',
    definitions: 5,
    runs: 1,
};

suite('createReport', () => {
    // Only genever is asserted: its results are what we can guarantee, and another tool's are the report's to show
    test('genever passes every probe', async function (this: Context) {
        this.timeout(120_000);
        const { tools } = await createReport({ ...options, tools: [geneverTool] });
        const { jsonSchema, openApi } = tools[0]!.results;

        const failed = (
            probes: readonly { description: string; feature: string }[],
            passed: readonly boolean[]
        ): string[] =>
            probes
                .filter((_, index) => passed[index] !== true)
                .map(({ feature, description }) => `${feature}: ${description}`);

        expect(jsonSchema!.typeErrors).to.deep.equal([]);
        expect(openApi!.typeErrors).to.deep.equal([]);
        expect(failed(jsonSchemaProbes, jsonSchema!.probes)).to.deep.equal([]);
        expect(failed(openApiProbes, openApi!.probes)).to.deep.equal([]);
        expect(jsonSchema!.generateMs).to.be.a('number');
    });

    test('runs every tool, with a result for each document it takes', async function (this: Context) {
        this.timeout(120_000);
        const { tools, commit, benchmark } = await createReport(options);

        expect(commit).to.equal('abc');
        expect(benchmark).to.deep.equal({ definitions: 5, runs: 1 });
        expect(tools.map(({ name }) => name)).to.deep.equal(
            [geneverTool, ...alternativeTools].map(({ name }) => name)
        );
        for (const { version, results } of tools) {
            expect(version).to.match(/^\d+\.\d+\.\d+/v);
            expect(results.jsonSchema ?? results.openApi).to.be.an('object');
        }
    });

    test('the command writes a report', async function (this: Context) {
        this.timeout(120_000);
        const directory = await mkdtemp(Path.join(tmpdir(), 'genever-comparison-'));
        await promisify(execFile)(process.execPath, [Path.resolve('bin.mjs')], {
            cwd: directory,
            // eslint-disable-next-line n/no-process-env -- What it reads
            env: { ...process.env, COMPARISON_COMMIT: 'from-ci' },
        });

        const report = JSON.parse(
            await readFile(Path.join(directory, 'report/genever.json'), 'utf8')
        ) as { commit: string };
        expect(report.commit).to.equal('from-ci');
        await rm(directory, { recursive: true });
    });

    /* eslint-disable n/no-process-env -- What it reads */
    test('takes its commit from the environment', () => {
        const previous = process.env.COMPARISON_COMMIT;
        process.env.COMPARISON_COMMIT = 'abc';
        const { commit, generatedAt } = environmentOptions();
        delete process.env.COMPARISON_COMMIT;
        const { commit: local } = environmentOptions();
        if (previous !== undefined) {
            process.env.COMPARISON_COMMIT = previous;
        }

        expect(commit).to.equal('abc');
        expect(local).to.equal('local');
        expect(generatedAt).to.match(/^\d{4}-\d{2}-\d{2}T/v);
    });

    /* eslint-enable n/no-process-env */

    test('writes the report to a file', async () => {
        const directory = await mkdtemp(Path.join(tmpdir(), 'genever-comparison-'));
        const path = Path.join(directory, 'nested', 'report.json');
        await writeReport(path, { ...options, tools: [] });

        const report = JSON.parse(await readFile(path, 'utf8')) as { commit: string };
        expect(report.commit).to.equal('abc');
        await rm(directory, { recursive: true });
    });

    test('a tool crashing is a result', async function (this: Context) {
        this.timeout(120_000);
        const crashing: Tool = {
            name: 'crashing',
            packageName: 'genever',
            timed: true,
            jsonSchema: () => {
                throw new Error('boom');
            },
        };
        const { tools } = await createReport({ ...options, tools: [crashing] });
        const { jsonSchema, openApi } = tools[0]!.results;

        expect(openApi).to.equal(undefined);
        expect(jsonSchema!.error).to.equal('boom');
        expect(jsonSchema!.probes).to.deep.equal(jsonSchemaProbes.map(() => false));
    });

    test('a tool crashing only on the large document has no time', async function (this: Context) {
        this.timeout(120_000);
        const crashing: Tool = {
            name: 'crashing',
            packageName: 'genever',
            timed: true,
            jsonSchema: document => {
                if (document !== jsonSchemaDocument) {
                    throw new Error('too large');
                }
                return 'export type Subject = unknown;';
            },
        };
        const { tools } = await createReport({ ...options, tools: [crashing] });
        const { error, generateError, generateMs } = tools[0]!.results.jsonSchema!;

        expect(error).to.equal(undefined);
        expect(generateError).to.equal('too large');
        expect(generateMs).to.equal(undefined);
    });

    test('a thrown non-error is its message, and errors in the source are kept', async function (this: Context) {
        this.timeout(120_000);
        const tools: Tool[] = [
            {
                name: 'throwing',
                packageName: 'genever',
                timed: false,
                jsonSchema: () => {
                    throw 'text';
                },
            },
            {
                name: 'invalid',
                packageName: 'genever',
                timed: false,
                jsonSchema: () => 'export type Subject = Missing;',
            },
        ];
        const report = await createReport({ ...options, tools });

        expect(report.tools[0]!.results.jsonSchema!.error).to.equal('text');
        expect(report.tools[1]!.results.jsonSchema!.typeErrors).to.deep.equal([
            "Cannot find name 'Missing'.",
        ]);
    });
});
