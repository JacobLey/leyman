import type { ManifestEntry, VerifyResult } from 'generated-signature';
import { expect } from '@leyman/expect';
import testVectors from '@leyman/generated-signature-test-vectors/test-vectors.json' with {
    type: 'json',
};
import {
    commentStyle,
    contentHash,
    GeneratedSignatureCommentStyleError,
    GeneratedSignatureMalformedError,
    GeneratedSignatureManifestError,
    GeneratedSignatureSectionIdError,
    manualSection,
    mergeSections,
    parseManifest,
    parseSections,
    serializeManifest,
    sign,
    verify,
    verifyManifestEntry,
} from 'generated-signature';
import { suite, test } from 'mocha-chain';

interface VectorError {
    readonly kind: string;
    readonly reason?: string;
    readonly line?: number;
}

const errorClasses: Readonly<Record<string, abstract new (...args: never[]) => Error>> = {
    malformed: GeneratedSignatureMalformedError,
    'missing-comment-style': TypeError,
    'unknown-comment-style': GeneratedSignatureCommentStyleError,
    'section-id': GeneratedSignatureSectionIdError,
    manifest: GeneratedSignatureManifestError,
};

const expectError = (fn: () => unknown, error: VectorError): void => {
    const errorClass = errorClasses[error.kind]!;
    expect(fn).to.throw(errorClass);
    if (error.kind === 'malformed') {
        expect(fn).to.throw().that.includes({ reason: error.reason, line: error.line });
    }
};

const flatten = (result: VerifyResult): Record<string, unknown> =>
    result.status === 'malformed'
        ? { status: result.status, reason: result.error.reason, line: result.error.line }
        : result;

const encoder = new TextEncoder();

suite('Test vectors', () => {
    test('commentStyle', () => {
        for (const { filePath, style } of testVectors.commentStyles) {
            expect(commentStyle(filePath), filePath).to.deep.equal(style);
        }
    });

    test('sign', () => {
        for (const vector of testVectors.sign) {
            const run = (): string =>
                sign(vector.text, 'options' in vector ? vector.options : undefined);
            if ('error' in vector) {
                expectError(run, vector.error);
            } else {
                expect(run(), vector.description).to.equal(vector.signed);
            }
        }
    });

    test('verify', () => {
        for (const { description, text, ...expected } of testVectors.verify) {
            expect(flatten(verify(text)), description).to.deep.equal(expected);
        }
    });

    test('parseSections', () => {
        for (const vector of testVectors.sections) {
            const run = (): unknown => parseSections(vector.text).values().toArray();
            if ('error' in vector) {
                expectError(run, vector.error);
            } else {
                expect(run(), vector.description).to.deep.equal(vector.sections);
            }
        }
    });

    test('mergeSections', () => {
        for (const vector of testVectors.merge) {
            const run = (): unknown =>
                mergeSections({ generated: vector.generated, existing: vector.existing });
            if ('error' in vector) {
                expectError(run, vector.error);
            } else {
                expect(run(), vector.description).to.deep.equal(vector.result);
            }
        }
    });

    test('manualSection', () => {
        for (const vector of testVectors.manualSection) {
            const run = (): string => manualSection(vector.options);
            if ('error' in vector) {
                expectError(run, vector.error);
            } else {
                expect(run(), vector.description).to.equal(vector.text);
            }
        }
    });

    test('contentHash', () => {
        for (const { description, text, hash } of testVectors.contentHash) {
            expect(contentHash(text), description).to.equal(hash);
            expect(contentHash(encoder.encode(text)), description).to.equal(hash);
        }
    });

    test('verifyManifestEntry', () => {
        for (const { description, content, entry, ...expected } of testVectors.manifestEntries) {
            expect(
                flatten(verifyManifestEntry(encoder.encode(content), entry as ManifestEntry)),
                description
            ).to.deep.equal(expected);
        }
    });

    test('parseManifest', () => {
        for (const vector of testVectors.parseManifest) {
            const run = (): unknown => parseManifest(vector.text).files;
            if ('error' in vector) {
                expectError(run, vector.error);
            } else {
                expect(run(), vector.description).to.deep.equal(vector.files);
            }
        }
    });

    test('serializeManifest', () => {
        for (const { description, files, text } of testVectors.serializeManifest) {
            expect(
                serializeManifest(files as Readonly<Record<string, ManifestEntry>>),
                description
            ).to.equal(text);
        }
    });
});
