import type { Context } from 'mocha';
import type { Tool } from '@leyman/e2e-xenever-comparison';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { promisify } from 'node:util';
import {
    alternativeTools,
    createReport,
    environmentOptions,
    writeReport,
    xeneverTool,
} from '@leyman/e2e-xenever-comparison';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

const options = {
    commit: 'abc',
    generatedAt: '2026-11-12T00:00:00.000Z',
    items: 5,
    runs: 1,
};

/**
 * Probes xenever fails, each for a gap the report should show until it is closed. A probe that starts passing fails the
 * test, so the list stays true.
 */
const xeneverGaps = [
    // Range facets on date and time types are unsupported
    'XSD: date range facets: accepts a value inside the facet',
    'XSD: date range facets: rejects a value outside the facet',
    // Abstract types, xsi:type and substitution groups wait for polymorphism
    'XSD: xsi:type: accepts a derived type named by xsi:type',
    'XSD: xsi:type: rejects invalid content of the derived type',
    'XSD: substitution groups: accepts a member of the substitution group',
    'XSD: substitution groups: rejects the abstract head of the group',
    // Identity constraints need XPath
    'XSD: identity constraints: accepts distinct keys',
    'XSD: identity constraints: rejects a duplicate xs:unique key',
];

/**
 * A tool that wraps xenever, changing one part of it.
 *
 * @param overrides - what it changes
 * @returns the tool
 */
const fake = (overrides: Partial<Tool>): Tool => ({ ...xeneverTool, name: 'fake', ...overrides });

suite('createReport', () => {
    // Only xenever is asserted: its results are what we can guarantee, and another tool's are the report's to show
    test('xenever passes every probe but its known gaps', async function (this: Context) {
        this.timeout(120_000);
        const { probes, tools } = await createReport({ ...options, tools: [xeneverTool] });
        const [{ probes: results, bundle, parse }] = tools as [(typeof tools)[number]];

        expect(
            probes
                .filter((_, index) => results[index]!.outcome !== 'pass')
                .map(({ feature, description }) => `${feature}: ${description}`)
        ).to.deep.equal(xeneverGaps);
        expect(bundle).to.have.property('nodeBuiltins').that.deep.equals([]);
        expect(parse).to.have.property('ms').that.is.a('number');
    });

    test('runs every tool, with a result for each probe', async function (this: Context) {
        this.timeout(120_000);
        const { tools, commit, benchmark, probes } = await createReport(options);

        expect(commit).to.equal('abc');
        expect(benchmark).to.deep.include({ items: 5, runs: 1 });
        expect(tools.map(({ name }) => name)).to.deep.equal(
            [xeneverTool, ...alternativeTools].map(({ name }) => name)
        );
        for (const { version, probes: results } of tools) {
            expect(version).to.match(/^\d+\.\d+\.\d+/v);
            expect(results).to.have.lengthOf(probes.length);
        }
        const fastXmlParser = tools.find(({ name }) => name === 'fast-xml-parser')!;
        expect(fastXmlParser.probes.filter((_, index) => probes[index]!.xsdOnly)).to.deep.equal(
            probes.filter(({ xsdOnly }) => xsdOnly).map(() => ({ outcome: 'n/a' }))
        );
    });

    test('the command writes a report', async function (this: Context) {
        this.timeout(300_000);
        const directory = await mkdtemp(Path.join(tmpdir(), 'xenever-comparison-'));
        await promisify(execFile)(process.execPath, [Path.resolve('bin.mjs')], {
            cwd: directory,
            // eslint-disable-next-line n/no-process-env -- What it reads
            env: { ...process.env, COMPARISON_COMMIT: 'from-ci' },
        });

        const report = JSON.parse(
            await readFile(Path.join(directory, 'report/xenever.json'), 'utf8')
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
        const directory = await mkdtemp(Path.join(tmpdir(), 'xenever-comparison-'));
        const path = Path.join(directory, 'nested', 'report.json');
        await writeReport(path, { ...options, tools: [] });

        const report = JSON.parse(await readFile(path, 'utf8')) as { commit: string };
        expect(report.commit).to.equal('abc');
        await rm(directory, { recursive: true });
    });

    test('a tool crashing is a result', async function (this: Context) {
        this.timeout(120_000);
        const crashing = fake({
            runtime: "export { missing } from 'no-such-package';",
            compile: () => {
                throw 'boom';
            },
        });
        const { tools } = await createReport({ ...options, tools: [crashing] });
        const [{ probes, errors, bundle, parse }] = tools as [(typeof tools)[number]];

        expect(probes.every(({ outcome }) => outcome === 'fail')).to.equal(true);
        expect(probes[0]!.detail).to.equal("couldn't load the schema: boom");
        expect(errors[0]).to.deep.equal({
            feature: 'One or many, from maxOccurs',
            message: 'boom',
        });
        expect(bundle).to.have.property('error').that.includes('no-such-package');
        expect(parse).to.deep.equal({ error: 'boom' });
    });

    test('types that fail to compile fail every type probe', async function (this: Context) {
        this.timeout(120_000);
        const broken = fake({
            compile: async scenario => ({
                ...(await xeneverTool.compile(scenario)),
                types: 'export type Subject = Missing;',
            }),
        });
        const { tools, probes } = await createReport({ ...options, tools: [broken] });
        const [{ probes: results, errors }] = tools as [(typeof tools)[number]];
        const index = probes.findIndex(
            ({ description }) => description === 'the type accepts the parsed value'
        );

        expect(results[index]).to.deep.equal({
            outcome: 'fail',
            detail: "its types don't compile: Cannot find name 'Missing'.",
        });
        expect(errors).to.deep.include({
            feature: 'Attributes and children',
            message: "types don't compile: Cannot find name 'Missing'.",
        });
    });

    test('every way a probe fails is reported', async function (this: Context) {
        this.timeout(120_000);
        /**
         * A tool that reads documents of some scenarios wrong.
         *
         * @param name - its name
         * @param wrong - what it reads instead, or throws, by scenario id
         * @returns the tool
         */
        const reading = (
            name: string,
            wrong: Readonly<Record<string, (xml: string) => unknown>>
        ): Tool =>
            fake({
                name,
                compile: async scenario => {
                    const compiled = await xeneverTool.compile(scenario);
                    return {
                        ...compiled,
                        parse: wrong[scenario.id] ?? compiled.parse,
                        ...(scenario.id === 'types' &&
                            name === 'loose' && { types: 'export type Subject = any;' }),
                    };
                },
            });
        const throwing = (thrown: unknown) => () => {
            throw thrown;
        };
        const { tools, probes } = await createReport({
            ...options,
            tools: [
                reading('throwing', {
                    types: throwing(new Error('nope')),
                    mixed: throwing(new Error('nope')),
                    namespaces: throwing(new Error('nope')),
                    locations: throwing('nope'),
                    // A string, so no property can be changed
                    repeated: () => 'flat',
                }),
                reading('loose', {
                    namespaces: xml => xml,
                    locations: () => 'accepted',
                    security: () => ({ body: 'a'.repeat(2000) }),
                    numbers: () => ({ total: 1n }),
                }),
            ],
        });
        const resultOf = (tool: number, feature: string, description: string): unknown =>
            tools[tool]!.probes[
                probes.findIndex(
                    probe => probe.feature === feature && probe.description === description
                )
            ];

        expect(
            resultOf(0, 'Types match values', 'the type accepts the parsed value')
        ).to.deep.equal({
            outcome: 'fail',
            detail: "couldn't parse the document: nope",
        });
        expect(
            resultOf(
                0,
                'One or many, from maxOccurs',
                'the type rejects a single item that is not in an array'
            )
        ).to.deep.equal({ outcome: 'fail', detail: 'the parsed value has nothing to change' });
        expect(
            resultOf(
                0,
                'One or many, from maxOccurs',
                'a repeatable element is an array when it occurs once'
            )
        ).to.deep.equal({ outcome: 'fail', detail: 'found undefined' });
        expect(
            resultOf(0, 'Mixed content', 'keeps text and elements in document order')
        ).to.deep.equal({
            outcome: 'fail',
            detail: 'rejected it: nope',
        });
        expect(
            resultOf(
                0,
                'Namespaces and prefixes',
                'the same document with prefix inv:, prefix i: or a default namespace reads the same'
            )
        ).to.deep.equal({
            outcome: 'fail',
            detail: 'rejected one: nope',
        });
        expect(resultOf(0, 'Error locations', 'gives the line of an invalid value')).to.deep.equal({
            outcome: 'fail',
            detail: 'nope',
        });

        expect(
            resultOf(
                1,
                'Namespaces and prefixes',
                'the same document with prefix inv:, prefix i: or a default namespace reads the same'
            )
        ).to.have.property('outcome', 'fail');
        expect(resultOf(1, 'Error locations', 'gives the line of an invalid value')).to.deep.equal({
            outcome: 'fail',
            detail: 'accepted it',
        });
        expect(
            resultOf(
                1,
                'DTDs and entities',
                'rejects or doesn’t expand nested entities (billion laughs)'
            )
        ).to.deep.equal({
            outcome: 'fail',
            detail: 'expanded to 2000 characters',
        });
        expect(resultOf(1, 'Numbers', 'keeps an integer past 2^53 exact')).to.deep.equal({
            outcome: 'fail',
            detail: 'found "1n"',
        });
        expect(resultOf(1, 'Types match values', 'the type rejects a string')).to.deep.equal({
            outcome: 'fail',
            detail: 'the type accepts it',
        });
    });

    test('types the probes cannot import are a bug of the comparison', async function (this: Context) {
        this.timeout(120_000);
        const unexported = fake({
            compile: async scenario => ({
                ...(await xeneverTool.compile(scenario)),
                types: 'export type Other = string;',
            }),
        });

        await expect(createReport({ ...options, tools: [unexported] })).to.be.rejectedWith(
            "Type probes can't import their types"
        );
    });
});
