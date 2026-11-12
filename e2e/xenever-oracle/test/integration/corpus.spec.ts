import { readdir } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { loadOutcome, parseOutcome, readXml } from '#test/lib/outcome.js';
import { xmllint } from '#test/lib/xmllint.js';
import { scanInstance } from '#test/lib/xsdtests.js';

/**
 * Hand-written schemas, each in a directory of its own beside instances named `valid-*.xml` or `invalid-*.xml`.
 */
const dataRoot = Path.join(import.meta.dirname, '../../test/data');

/**
 * Instances where xmllint disagrees, and why.
 */
const expectedDisagreements: ReadonlyMap<string, string> = new Map([
    [
        'order/valid-date-whitespace.xml',
        // https://www.w3.org/TR/xmlschema-2/#dateTime: whiteSpace is fixed to collapse.
        'libxml2 does not collapse the whitespace around an xs:dateTime value',
    ],
]);

suite('Hand-written corpus', () => {
    for (const name of ['order']) {
        test(`xenever and xmllint both accept exactly the valid instances of ${name}`, async () => {
            const schema = `${name}/${name}.xsd`;
            const files = await readdir(Path.join(dataRoot, name));
            const instances = files
                .filter(file => file.endsWith('.xml'))
                .map(file => `${name}/${file}`)
                .toSorted((a, b) => a.localeCompare(b));
            const set = await loadOutcome(Path.join(dataRoot, schema));
            if (!('elements' in set)) {
                throw new Error(`xenever could not load ${schema}: ${String(set.message)}`);
            }
            const lint = await xmllint(dataRoot, [schema], instances);
            expect(lint.schemaValid).to.equal(true);
            const outcomes = await Promise.all(
                instances.map(async instance => {
                    const text = await readXml(Path.join(dataRoot, instance));
                    const { outcome, message } = parseOutcome(text, set, scanInstance(text).root);
                    return {
                        expected: Path.basename(instance).startsWith('valid-')
                            ? 'valid'
                            : 'invalid',
                        xenever: outcome,
                        xmllint: lint.instances.get(instance) === true ? 'valid' : 'invalid',
                        instance,
                        message,
                    };
                })
            );
            expect(
                outcomes.filter(
                    ({ instance, expected, xenever, xmllint: lintOutcome }) =>
                        xenever !== expected ||
                        (lintOutcome === expected) === expectedDisagreements.has(instance)
                )
            ).to.deep.equal([]);
        });
    }
});
