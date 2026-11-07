import { expect } from '@leyman/expect';
import {
    contentHash,
    GeneratedSignatureManifestError,
    parseManifest,
    serializeManifest,
    sign,
    verifyManifestEntry,
} from 'generated-signature';
import { suite, test } from 'mocha-chain';

const encoder = new TextEncoder();

suite('contentHash', () => {
    test('Is versioned', () => {
        expect(contentHash('{}\n')).to.match(/^v1:[\da-f]{32}$/v);
    });

    test('Ignores CRLF line breaks', () => {
        expect(contentHash('a\r\nb\r\n')).to.equal(contentHash('a\nb\n'));
    });

    test('Keeps a lone CR', () => {
        expect(contentHash('a\rb')).to.not.equal(contentHash('a\nb'));
    });

    test('Hashes bytes like text', () => {
        expect(contentHash(encoder.encode('a\r\nb'))).to.equal(contentHash('a\nb'));
    });

    test('Detects changes', () => {
        expect(contentHash('{"a":1}')).to.not.equal(contentHash('{"a":2}'));
    });
});

suite('verifyManifestEntry', () => {
    test('Valid hash', () => {
        expect(verifyManifestEntry('{}\n', { hash: contentHash('{}\n') })).to.deep.equal({
            status: 'valid',
        });
    });

    test('Invalid hash', () => {
        expect(verifyManifestEntry('{"a":1}\n', { hash: contentHash('{}\n') })).to.deep.equal({
            status: 'invalid',
        });
    });

    test('Inline signature', () => {
        const signed = sign('a\n', { filePath: 'a.ts' });
        expect(verifyManifestEntry(encoder.encode(signed), { signature: 'inline' })).to.deep.equal({
            status: 'valid',
        });
    });

    test('Inline signature, as text', () => {
        expect(verifyManifestEntry('a\n', { signature: 'inline' })).to.deep.equal({
            status: 'unsigned',
        });
    });
});

suite('parseManifest', () => {
    const files = {
        'a.json': { hash: 'v1:abc' },
        'b.ts': { signature: 'inline', inputs: { generator: 'genever@1.0.0' } },
    } as const;

    test('Parses a manifest', () => {
        expect(parseManifest(JSON.stringify({ version: 1, files }))).to.deep.equal({
            version: 1,
            files,
        });
    });

    test('Round-trips serializeManifest', () => {
        expect(parseManifest(serializeManifest(files)).files).to.deep.equal(files);
    });

    for (const [name, text] of [
        ['Not JSON', '{'],
        ['Not an object', '[]'],
        ['Null', 'null'],
        ['Unknown version', JSON.stringify({ version: 2, files: {} })],
        ['Files not an object', JSON.stringify({ version: 1, files: [] })],
        ['Files null', JSON.stringify({ version: 1, files: null })],
        ['Entry not an object', JSON.stringify({ version: 1, files: { a: 'x' } })],
        ['Entry null', JSON.stringify({ version: 1, files: { a: null } })],
        ['Entry array', JSON.stringify({ version: 1, files: { a: [] } })],
        ['Neither hash nor signature', JSON.stringify({ version: 1, files: { a: {} } })],
        [
            'Both hash and signature',
            JSON.stringify({ version: 1, files: { a: { hash: 'x', signature: 'inline' } } }),
        ],
        [
            'Unknown signature',
            JSON.stringify({ version: 1, files: { a: { hash: 'x', signature: 'other' } } }),
        ],
        [
            'Hash not a string',
            JSON.stringify({ version: 1, files: { a: { hash: 1, signature: 'inline' } } }),
        ],
        ['Unknown key', JSON.stringify({ version: 1, files: { a: { hash: 'x', extra: 1 } } })],
        [
            'Inputs not strings',
            JSON.stringify({ version: 1, files: { a: { hash: 'x', inputs: { b: 1 } } } }),
        ],
        [
            'Inputs not an object',
            JSON.stringify({ version: 1, files: { a: { hash: 'x', inputs: null } } }),
        ],
        [
            'Inputs an array',
            JSON.stringify({ version: 1, files: { a: { hash: 'x', inputs: [] } } }),
        ],
    ] as const) {
        test(`Rejects: ${name}`, () => {
            expect(() => parseManifest(text)).to.throw(GeneratedSignatureManifestError);
        });
    }
});

suite('serializeManifest', () => {
    test('Sorts paths and inputs', () => {
        const text = serializeManifest({
            'b.json': { hash: 'v1:b', inputs: { z: '1', a: '2' } },
            'a.json': { hash: 'v1:a' },
        });
        expect(text).to.equal(
            `${JSON.stringify(
                {
                    version: 1,
                    files: {
                        'a.json': { hash: 'v1:a' },
                        'b.json': { hash: 'v1:b', inputs: { a: '2', z: '1' } },
                    },
                },
                null,
                2
            )}\n`
        );
    });
});
