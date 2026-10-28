import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parseJsonc } from '#internal/lib/jsonc.js';

suite('parseJsonc', () => {
    test('parses JSON', () => {
        expect(parseJsonc('{ "a": [1, true, null] }')).to.deep.equal({ a: [1, true, null] });
    });

    test('ignores comments', () => {
        expect(
            parseJsonc(
                [
                    '// leading',
                    '{',
                    '    "a": 1, // trailing',
                    '    /* block */ "b": /* inline */ 2',
                    '}',
                ].join('\n')
            )
        ).to.deep.equal({ a: 1, b: 2 });
    });

    test('ignores trailing commas', () => {
        expect(parseJsonc('{ "a": [1, 2, ], "b": { "c": 3, /* gone */ }, }')).to.deep.equal({
            a: [1, 2],
            b: { c: 3 },
        });
    });

    test('keeps strings as they are', () => {
        expect(
            parseJsonc(
                String.raw`{ "a": "// not a comment", "b": "/* nor */", "c": ",]", "d": "\"," }`
            )
        ).to.deep.equal({
            a: '// not a comment',
            b: '/* nor */',
            c: ',]',
            d: '",',
        });
    });

    test('a comment can end the text', () => {
        expect(parseJsonc('1 // the end')).to.equal(1);
        expect(parseJsonc('1 /* never closed')).to.equal(1);
    });

    test('throws for anything else', () => {
        expect(() => parseJsonc('{ "a": ')).to.throw(SyntaxError);
        expect(() => parseJsonc('"never closed')).to.throw(SyntaxError);
    });
});
