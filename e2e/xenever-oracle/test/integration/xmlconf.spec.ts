import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { extractSuite } from '#test/lib/suites.js';
import { hasDoctype, readXmlTests, runXmlTest } from '#test/lib/xmlconf.js';

suite('W3C XML conformance suite', () => {
    test('parse rejects every document that is not well-formed, and every DTD, with XeneverXmlError', async () => {
        const extracted = await extractSuite('xmlconf');
        try {
            const tests = await readXmlTests(extracted.root);
            const failures: string[] = [];
            const counts = { notWf: 0, notWfWithoutDtd: 0, namespaces: 0, doctype: 0, accepted: 0 };
            for (const xmlTest of tests) {
                const [outcome, isDtd] = await Promise.all([
                    runXmlTest(extracted.root, xmlTest),
                    hasDoctype(extracted.root, xmlTest),
                ]);
                counts[xmlTest.set === 'not-wf' ? 'notWf' : 'namespaces']++;
                if (isDtd) {
                    counts.doctype++;
                } else if (xmlTest.type === 'not-wf') {
                    counts.notWfWithoutDtd++;
                }
                const isRejected = xmlTest.type === 'not-wf' || isDtd;
                if (isRejected !== (outcome === 'xml error')) {
                    failures.push(
                        `${xmlTest.id} (${xmlTest.path}): ${xmlTest.type}${isDtd ? ' with a DTD' : ''}, but ${outcome}`
                    );
                }
                if (outcome === 'accepted') {
                    counts.accepted++;
                }
            }
            // eslint-disable-next-line no-console -- The counts are what the run reports
            console.log(
                `      ${counts.notWf} not well-formed (${counts.notWfWithoutDtd} without a DTD) and ${counts.namespaces} namespace tests: ${counts.doctype} with a DTD, ${counts.accepted} accepted`
            );
            expect(failures).to.deep.equal([]);
        } finally {
            await extracted.remove();
        }
    }).timeout(120_000);
});
