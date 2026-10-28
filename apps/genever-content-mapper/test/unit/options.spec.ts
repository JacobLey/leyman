import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parseOptions } from '#internal/lib/options.js';

suite('options', () => {
    test('none', () => {
        expect(parseOptions(undefined)).to.deep.equal({ options: {}, diagnostics: [] });
        expect(parseOptions(null)).to.deep.equal({ options: {}, diagnostics: [] });
    });

    test('every option', () => {
        expect(
            parseOptions({
                name: 'Root',
                openApi30: true,
                parameterDefaults: true,
                strict: false,
                typedMinItems: 0,
            })
        ).to.deep.equal({
            options: {
                name: 'Root',
                openApi30: true,
                parameterDefaults: true,
                strict: false,
                typedMinItems: 0,
            },
            diagnostics: [],
        });
    });

    test('not an object', () => {
        expect(parseOptions([])).to.deep.equal({
            options: {},
            diagnostics: [
                {
                    path: [],
                    messageText: 'genever-content-mapper options must be an object.',
                    code: 1,
                },
            ],
        });
    });

    test('invalid and unknown options are reported, valid ones kept', () => {
        expect(
            parseOptions({
                strict: 'no',
                name: '',
                typedMinItems: 1.5,
                fetch: true,
                openApi30: false,
            })
        ).to.deep.equal({
            options: { openApi30: false },
            diagnostics: [
                { path: ['strict'], messageText: "Option 'strict' must be a boolean.", code: 1 },
                {
                    path: ['name'],
                    messageText: "Option 'name' must be a non-empty string.",
                    code: 1,
                },
                {
                    path: ['typedMinItems'],
                    messageText: "Option 'typedMinItems' must be a non-negative integer.",
                    code: 1,
                },
                { path: ['fetch'], messageText: "Unknown option 'fetch'.", code: 1 },
            ],
        });
    });
});
