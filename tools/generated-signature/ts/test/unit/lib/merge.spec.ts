import type { MalformedReason, ManualSection } from 'generated-signature';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import {
    GeneratedSignatureCommentStyleError,
    GeneratedSignatureMalformedError,
    GeneratedSignatureSectionIdError,
    manualSection,
    mergeSections,
    parseSections,
} from 'generated-signature';
import { suite, test } from 'mocha-chain';

const lines = (...parts: string[]): string => parts.join('\n');

suite('parseSections', () => {
    test('Finds sections by id', () => {
        const sections = parseSections(
            lines(
                'a',
                '// @manual-start one',
                'b',
                'c',
                '// @manual-end one',
                '# @manual-start two',
                '# @manual-end two',
                ''
            )
        );
        expectTypeOf(sections).toEqualTypeOf<ReadonlyMap<string, ManualSection>>();
        expect(sections.values().toArray()).to.deep.equal([
            { id: 'one', body: 'b\nc\n', startLine: 2, endLine: 5 },
            { id: 'two', body: '', startLine: 6, endLine: 7 },
        ]);
    });

    test('Allows markers in any comment syntax', () => {
        const sections = parseSections(
            lines('<!-- @manual-start a.b_c-d -->', 'x', '<!-- @manual-end a.b_c-d -->')
        );
        expect(sections.get('a.b_c-d')).to.have.property('body', 'x\n');
    });

    test('Keeps CRLF line breaks in the body', () => {
        const sections = parseSections('// @manual-start a\r\nx\r\n// @manual-end a\r\n');
        expect(sections.get('a')).to.have.property('body', 'x\r\n');
    });

    test('Ignores a marker glued to other text', () => {
        expect(parseSections('see foo@manual-start bar\n').size).to.equal(0);
    });

    test('Ignores a longer word', () => {
        expect(parseSections('// @manual-started a\n').size).to.equal(0);
    });

    suite('Malformed', () => {
        const expectReason = (text: string, reason: MalformedReason): void => {
            expect(() => parseSections(text))
                .to.throw(GeneratedSignatureMalformedError)
                .with.property('reason', reason);
        };

        test('Missing id', () => {
            expectReason('// @manual-start\n', 'invalid-section-id');
        });

        test('Invalid id', () => {
            expectReason('// @manual-start a:b\n', 'invalid-section-id');
        });

        test('Nested', () => {
            expectReason(
                lines('// @manual-start a', '// @manual-start b', '// @manual-end b'),
                'nested-section'
            );
        });

        test('Duplicate', () => {
            expectReason(
                lines(
                    '// @manual-start a',
                    '// @manual-end a',
                    '// @manual-start a',
                    '// @manual-end a'
                ),
                'duplicate-section'
            );
        });

        test('End without start', () => {
            expectReason('// @manual-end a\n', 'unopened-section');
        });

        test('End of another section', () => {
            expectReason(lines('// @manual-start a', '// @manual-end b'), 'unopened-section');
        });

        test('Unclosed', () => {
            expectReason('// @manual-start a', 'unclosed-section');
        });

        test('Reports the line', () => {
            expect(() => parseSections(lines('a', 'b', '// @manual-end a')))
                .to.throw(GeneratedSignatureMalformedError)
                .with.property('line', 3);
        });
    });
});

suite('mergeSections', () => {
    const generated = lines(
        'gen 1',
        '// @manual-start a',
        'default a',
        '// @manual-end a',
        '// @manual-start b',
        'default b',
        '// @manual-end b',
        ''
    );

    test('Keeps existing bodies by id', () => {
        const existing = lines(
            'old gen',
            '// @manual-start b',
            'custom b',
            '// @manual-end b',
            '// @manual-start a',
            'custom a',
            '// @manual-end a',
            ''
        );
        expect(mergeSections({ generated, existing })).to.deep.equal({
            text: lines(
                'gen 1',
                '// @manual-start a',
                'custom a',
                '// @manual-end a',
                '// @manual-start b',
                'custom b',
                '// @manual-end b',
                ''
            ),
            orphans: [],
        });
    });

    test('Uses the default for a new section', () => {
        const existing = lines('// @manual-start a', 'custom a', '// @manual-end a', '');
        expect(mergeSections({ generated, existing }).text).to.include('default b');
    });

    test('Keeps an emptied section empty', () => {
        const existing = lines('// @manual-start a', '// @manual-end a', '');
        expect(mergeSections({ generated, existing }).text).to.not.include('default a');
    });

    test('Reports orphaned sections with content', () => {
        const existing = lines(
            '// @manual-start gone',
            'custom',
            '// @manual-end gone',
            '// @manual-start blank',
            '  ',
            '// @manual-end blank',
            ''
        );
        expect(mergeSections({ generated, existing }).orphans).to.deep.equal(['gone']);
    });
});

suite('manualSection', () => {
    test('Renders markers around the body', () => {
        expect(manualSection({ id: 'a', body: 'x\ny\n', filePath: 'a.ts' })).to.equal(
            lines('// @manual-start a', 'x', 'y', '// @manual-end a')
        );
    });

    test('Renders an empty section', () => {
        expect(manualSection({ id: 'a', filePath: 'a.py' })).to.equal(
            lines('# @manual-start a', '# @manual-end a')
        );
    });

    test('Uses a comment style with an end', () => {
        expect(manualSection({ id: 'a', comment: { start: '/*', end: '*/' } })).to.equal(
            lines('/* @manual-start a */', '/* @manual-end a */')
        );
    });

    test('Indents markers and non-blank lines', () => {
        expect(
            manualSection({ id: 'a', body: 'x\n\ny', indent: ' '.repeat(4), filePath: 'a.ts' })
        ).to.equal(lines('    // @manual-start a', '    x', '', '    y', '    // @manual-end a'));
    });

    test('Round-trips through parseSections', () => {
        const section = manualSection({ id: 'a', body: 'x', filePath: 'a.ts' });
        expect(parseSections(section).get('a')).to.have.property('body', 'x\n');
    });

    test('Rejects an invalid id', () => {
        expect(() => manualSection({ id: 'a b', filePath: 'a.ts' })).to.throw(
            GeneratedSignatureSectionIdError
        );
    });

    test('Rejects an unknown file type', () => {
        expect(() => manualSection({ id: 'a', filePath: 'a.unknown' })).to.throw(
            GeneratedSignatureCommentStyleError
        );
    });
});
