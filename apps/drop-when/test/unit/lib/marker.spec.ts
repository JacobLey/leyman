import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parseMarkers } from '#internal/lib/marker.js';

const token = ['drop', 'when:'].join('-');

suite('parseMarkers', () => {
    suite('released', () => {
        test('Parses an issue URL', () => {
            expect(
                parseMarkers(
                    'a.ts',
                    `// ${token} released https://github.com/owner/repo.js/issues/12`
                )
            ).to.deep.equal({
                markers: [
                    {
                        path: 'a.ts',
                        line: 1,
                        condition: {
                            kind: 'released',
                            url: 'https://github.com/owner/repo.js/issues/12',
                            owner: 'owner',
                            repo: 'repo.js',
                            type: 'issues',
                            number: 12,
                        },
                    },
                ],
                malformed: [],
            });
        });

        test('Parses a pull request URL', () => {
            const { markers } = parseMarkers(
                'a.ts',
                `# ${token} released https://github.com/my-org/my_repo/pull/3`
            );
            expect(markers[0]?.condition).to.include({ type: 'pull', number: 3 });
        });

        test('Ignores what follows the URL', () => {
            const { markers } = parseMarkers(
                'a.md',
                `<!-- ${token} released https://github.com/o/r/pull/3 -->`
            );
            expect(markers[0]?.condition).to.include({ url: 'https://github.com/o/r/pull/3' });
        });

        test('Rejects a URL that is not an issue or pull request', () => {
            const { malformed } = parseMarkers(
                'a.ts',
                `${token} released https://github.com/o/r/commit/abc`
            );
            expect(malformed).to.have.length(1);
            expect(malformed[0]?.problem).to.contain('https://github.com/o/r/commit/abc');
        });

        test('Rejects a URL with trailing punctuation', () => {
            const { malformed } = parseMarkers(
                'a.ts',
                `${token} released https://github.com/o/r/issues/1.`
            );
            expect(malformed).to.have.length(1);
        });

        test('Rejects a missing URL', () => {
            const { malformed } = parseMarkers('a.ts', `${token} released`);
            expect(malformed).to.have.length(1);
        });
    });

    suite('date', () => {
        test('Parses a day', () => {
            expect(parseMarkers('a.yaml', `  # ${token} 2026-11-25`).markers).to.deep.equal([
                { path: 'a.yaml', line: 1, condition: { kind: 'date', date: '2026-11-25' } },
            ]);
        });

        test('Rejects a day that does not exist', () => {
            expect(parseMarkers('a.ts', `${token} 2026-02-30`).malformed).to.deep.equal([
                { path: 'a.ts', line: 1, problem: '2026-02-30 is not a day' },
            ]);
        });

        test('Rejects a month that does not exist', () => {
            expect(parseMarkers('a.ts', `${token} 2026-13-01`).malformed).to.have.length(1);
        });
    });

    test('Rejects a marker with no condition', () => {
        const { malformed } = parseMarkers('a.ts', `// ${token}`);
        expect(malformed).to.have.length(1);
        expect(malformed[0]?.problem).to.contain('expected "released');
    });

    test('Rejects a condition it does not know', () => {
        expect(parseMarkers('a.ts', `// ${token} fixed`).malformed).to.have.length(1);
    });

    test('Requires whitespace after the condition', () => {
        expect(parseMarkers('a.css', `/* ${token} 2026-11-25*/`).malformed).to.have.length(1);
    });

    test('Finds every marker on a line, with its line number', () => {
        const { markers } = parseMarkers(
            'a.ts',
            ['first', `${token} 2026-01-01 and ${token} 2026-01-02`, 'last'].join('\n')
        );
        expect(markers.map(({ line, condition }) => [line, condition])).to.deep.equal([
            [2, { kind: 'date', date: '2026-01-01' }],
            [2, { kind: 'date', date: '2026-01-02' }],
        ]);
    });

    test('Reads Windows line endings', () => {
        expect(parseMarkers('a.ts', `${token} 2026-01-01\r\nx`).markers).to.have.length(1);
    });

    test('Finds nothing in a file without markers', () => {
        expect(parseMarkers('a.ts', 'drop when\n')).to.deep.equal({ markers: [], malformed: [] });
    });
});
