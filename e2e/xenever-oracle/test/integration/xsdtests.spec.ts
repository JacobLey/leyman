import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { judgeXsdTests } from '#test/lib/judge-xsdtests.js';
import { runXsdTests } from '#test/lib/run-xsdtests.js';
import { extractSuite } from '#test/lib/suites.js';
import { expectedDisagreements, limits } from '#test/lib/xsdtests-expected.js';

suite('W3C XML Schema test suite', () => {
    test('xenever agrees with xmllint and the suite, but for the expected disagreements', async () => {
        const extracted = await extractSuite('xsdtests');
        try {
            const started = performance.now();
            const results = await runXsdTests(extracted.root);
            const seconds = (performance.now() - started) / 1000;
            const { counts, byDisagreement, failures } = judgeXsdTests(
                results,
                expectedDisagreements,
                limits
            );
            // eslint-disable-next-line no-console -- The counts are what the run reports
            console.log(
                `      ${results.length} tests in ${seconds.toFixed(1)}s: ${counts.inSubset} in the subset (${counts.passed} passed, ${counts.unsupported} unsupported, ${counts.expectedDisagreement} expected disagreements), ${counts.outsideSubset} outside it`
            );
            for (const [name, count] of byDisagreement) {
                // eslint-disable-next-line no-console -- The counts are what the run reports
                console.log(`        ${name}: ${count}`);
            }
            expect(failures).to.deep.equal([]);
        } finally {
            await extracted.remove();
        }
    }).timeout(600_000);
});
