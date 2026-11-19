import type { Outcome } from './outcome.js';
import type { OutsideReason, SchemaCase, Validity } from './xsdtests.js';
import { availableParallelism } from 'node:os';
import Path from 'node:path';
import { loadOutcome, parseOutcome, readXml } from './outcome.js';
import { xmllint } from './xmllint.js';
import { readXsdTests, scanInstance, scanSchema } from './xsdtests.js';

/**
 * One schema or instance test, run.
 */
export interface TestResult {
    /**
     * The test's id.
     */
    readonly id: string;
    /**
     * Whether it is a schema or instance test.
     */
    readonly kind: 'instance' | 'schema';
    /**
     * Outcome the suite expects.
     */
    readonly expected: Validity;
    /**
     * Constructs outside xenever's subset that reading it independently found, empty when inside.
     */
    readonly outside: readonly OutsideReason[];
    /**
     * What xenever did.
     */
    readonly xenever: Outcome;
    /**
     * The message of the error xenever threw, if any.
     */
    readonly message?: string | undefined;
    /**
     * What xmllint said, `null` when it isn't compared (outside the subset).
     */
    readonly xmllint: Validity | null;
    /**
     * What xmllint printed about it, for a failure message.
     */
    readonly xmllintOutput?: string | undefined;
}

/**
 * Runs tasks with at most `limit` running at once.
 *
 * @param items - inputs
 * @param limit - how many may run at once
 * @param task - runs one input
 * @returns the results, in input order
 */
const pool = async <T, R>(
    items: readonly T[],
    limit: number,
    task: (item: T) => Promise<R>
): Promise<R[]> => {
    const results: R[] = [];
    let next = 0;
    await Promise.all(
        Array.from({ length: limit }, async () => {
            while (next < items.length) {
                const index = next;
                next++;
                results[index] = await task(items[index]!);
            }
        })
    );
    return results;
};

/**
 * Runs one test group: the schema, then each instance when xenever loaded it.
 *
 * @param root - root of the suite
 * @param schemaCase - the group
 * @returns a result per test
 */
const runCase = async (root: string, schemaCase: SchemaCase): Promise<TestResult[]> => {
    const scan = await scanSchema(root, schemaCase.documents);
    const outside = [...scan.outside].toSorted((a, b) => a.localeCompare(b));
    if (outside.includes('multiple schema documents')) {
        // `loadXsd` takes one entry document, so there is nothing to run.
        return [
            {
                expected: schemaCase.expected,
                id: schemaCase.id,
                kind: 'schema',
                xenever: 'unsupported',
                xmllint: null,
                outside,
            },
        ];
    }
    const loaded = await loadOutcome(Path.join(root, schemaCase.documents[0]!));
    const instances = await Promise.all(
        schemaCase.instances.map(async instance => {
            let text: string | null = null;
            try {
                text = await readXml(Path.join(root, instance.document));
            } catch {
                // Bytes no decoder reads: an XML error, as for any XML processor.
            }
            return { instance, text, scan: text === null ? null : scanInstance(text) };
        })
    );
    const isCompared = outside.length === 0;
    const lint = isCompared
        ? await xmllint(
              root,
              scan.files,
              instances.map(({ instance }) => instance.document)
          )
        : null;
    let schemaLint: Validity | null = null;
    if (lint) {
        schemaLint = lint.schemaValid ? 'valid' : 'invalid';
    }
    const results: TestResult[] = [
        {
            expected: schemaCase.expected,
            id: schemaCase.id,
            kind: 'schema',
            ...('elements' in loaded
                ? { xenever: 'valid' as const }
                : { xenever: loaded.outcome, message: loaded.message }),
            xmllint: schemaLint,
            xmllintOutput: lint?.output,
            outside,
        },
    ];
    if ('outcome' in loaded) {
        return results;
    }
    for (const { instance, text, scan: instanceScan } of instances) {
        const instanceOutside = [...(instanceScan?.outside ?? [])].toSorted((a, b) =>
            a.localeCompare(b)
        );
        const parsed =
            text === null
                ? { outcome: 'xml' as const, message: 'Not decodable' }
                : parseOutcome(text, loaded, instanceScan?.root ?? null);
        let instanceLint: Validity | null = null;
        if (lint && instanceOutside.length === 0) {
            instanceLint = lint.instances.get(instance.document) === true ? 'valid' : 'invalid';
        }
        results.push({
            expected: instance.expected,
            id: instance.id,
            kind: 'instance',
            outside: [...outside, ...instanceOutside],
            xenever: parsed.outcome,
            message: parsed.message,
            xmllint: instanceLint,
            xmllintOutput: lint?.output
                .split('\n')
                .filter(line => line.startsWith(instance.document))
                .join('\n'),
        });
    }
    return results;
};

/**
 * Runs every test of the W3C XML Schema test suite that applies to XSD 1.0.
 *
 * @param root - root of the suite
 * @returns a result per schema and instance test
 */
export const runXsdTests = async (root: string): Promise<TestResult[]> => {
    const cases = await readXsdTests(root);
    const results = await pool(cases, availableParallelism(), async schemaCase =>
        runCase(root, schemaCase)
    );
    return results.flat();
};
