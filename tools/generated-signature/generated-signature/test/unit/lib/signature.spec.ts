import type { VerifyResult } from 'generated-signature';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import {
    GeneratedSignatureCommentStyleError,
    GeneratedSignatureMalformedError,
    sign,
    signatureToken,
    verify,
} from 'generated-signature';
import { suite, test } from 'mocha-chain';

// Built from pieces so this file never contains a real token, which a lint rule would check.
const TOKEN_NAME = ['@generated', 'signature'].join('-');
const token = (hash: string, version = '1'): string => `${TOKEN_NAME} v${version}:${hash}`;

const generated = [
    'export const a = 1;',
    '// @manual-start custom',
    'export const b = 2;',
    '// @manual-end custom',
    'export const c = 3;',
    '',
].join('\n');

const signed = sign(generated, { filePath: 'foo.ts' });

suite('sign', () => {
    test('Inserts a signature line at the top', () => {
        expect(signed.split('\n', 1)[0]).to.match(
            new RegExp(String.raw`^// ${TOKEN_NAME} v1:[\da-f]{32} Generated file\.`, 'u')
        );
    });

    test('Keeps the rest of the content', () => {
        expect(signed.split('\n').slice(1).join('\n')).to.equal(generated);
    });

    test('Uses an explicit comment style', () => {
        const result = sign('<p>hi</p>\n', { comment: { start: '<!--', end: '-->' } });
        expect(result).to.match(new RegExp(`^<!-- ${TOKEN_NAME} v1:[\\da-f]{32} .*-->\n<p>`, 'u'));
    });

    test('Uses a custom message', () => {
        const result = sign('a\n', { filePath: 'a.ts', message: 'By my-tool.' });
        expect(result.split('\n', 1)[0]).to.match(/ By my-tool\.$/u);
    });

    test('Fills in a token from signatureToken()', () => {
        const result = sign(`// AUTO-BARREL ${signatureToken()}\nexport * from './a.js';\n`);
        expect(result.split('\n', 1)[0]).to.match(/^\/\/ AUTO-BARREL \S+ v1:[\da-f]{32}$/u);
        expect(verify(result)).to.deep.equal({ status: 'valid' });
    });

    test('Keeps a shebang on the first line', () => {
        const result = sign('#!/usr/bin/env node\nconsole.log(1);\n', { filePath: 'bin.js' });
        expect(result.split('\n')).to.have.length(4);
        expect(result.split('\n', 2)[1]).to.include(TOKEN_NAME);
    });

    test('Keeps an XML declaration on the first line', () => {
        const result = sign('<?xml version="1.0"?>\n<a/>\n', { filePath: 'a.xml' });
        expect(result.split('\n', 2)[1]).to.match(/^<!-- /u);
    });

    test('Appends after a shebang without a line break', () => {
        const result = sign('#!/bin/sh', { filePath: 'run.sh' });
        expect(result).to.match(new RegExp(`^#!/bin/sh\n# ${TOKEN_NAME}`, 'u'));
    });

    test('Keeps Markdown front matter at the start', () => {
        const result = sign('---\ntitle: A\n---\n# A\n', { filePath: 'a.md' });
        expect(result).to.match(
            new RegExp(`^---\ntitle: A\n---\n<!-- ${TOKEN_NAME}[^\n]+-->\n# A\n$`, 'u')
        );
        expect(verify(result)).to.deep.equal({ status: 'valid' });

        const crlf = sign('---\r\ntitle: A\r\n---\r\n# A\r\n', { filePath: 'a.md' });
        expect(crlf).to.match(/^---\r\ntitle: A\r\n---\r\n<!-- [^\n]+-->\r\n# A\r\n$/u);

        const onlyFrontMatter = sign('---\ntitle: A\n---', { filePath: 'a.mdx' });
        expect(onlyFrontMatter).to.match(
            new RegExp(`^---\ntitle: A\n---\n<!-- ${TOKEN_NAME}`, 'u')
        );
    });

    test('Only Markdown comments skip front matter, and only when it is closed', () => {
        expect(sign('---\na: 1\n---\n', { filePath: 'a.yml' })).to.match(
            new RegExp(`^# ${TOKEN_NAME}`, 'u')
        );
        expect(sign('---\nnot closed\n', { filePath: 'a.md' })).to.match(
            new RegExp(`^<!-- ${TOKEN_NAME}`, 'u')
        );
    });

    test('Uses CRLF line breaks when the text does', () => {
        const result = sign('a\r\nb\r\n', { filePath: 'a.ts' });
        expect(result).to.match(/^\/\/ [^\n]+\r\na\r\nb\r\n$/u);
    });

    test('Fills in a token the generator placed', () => {
        const text = `/* ${token('0'.repeat(32))} */\nbody\n`;
        const result = sign(text);
        expect(result).to.not.equal(text);
        expect(verify(result)).to.deep.equal({ status: 'valid' });
    });

    test('Is idempotent', () => {
        expect(sign(signed)).to.equal(signed);
    });

    test('Refreshes the signature of an edited file', () => {
        const resigned = sign(signed.replace('a = 1', 'a = 10'));
        expect(verify(resigned)).to.deep.equal({ status: 'valid' });
    });

    test('Requires a comment style without a token', () => {
        expect(() => sign(generated)).to.throw(TypeError);
    });

    test('Fails for a file type without comments', () => {
        expect(() => sign('{}', { filePath: 'a.json' })).to.throw(
            GeneratedSignatureCommentStyleError
        );
    });

    test('Fails on malformed sections', () => {
        expect(() => sign('// @manual-start a\n', { filePath: 'a.ts' })).to.throw(
            GeneratedSignatureMalformedError
        );
    });
});

suite('verify', () => {
    test('Types', () => {
        expectTypeOf(verify('')).toEqualTypeOf<VerifyResult>();
    });

    test('Unsigned without a token', () => {
        expect(verify(generated)).to.deep.equal({ status: 'unsigned' });
    });

    test('Ignores a token with a short hash', () => {
        expect(verify(`// ${token('abc')}\n`)).to.deep.equal({ status: 'unsigned' });
    });

    test('Valid when signed', () => {
        expect(verify(signed)).to.deep.equal({ status: 'valid' });
    });

    test('Valid after editing a manual section', () => {
        const edited = signed.replace('export const b = 2;', 'export const b = 20;\n// more');
        expect(verify(edited)).to.deep.equal({ status: 'valid' });
    });

    test('Valid after emptying a manual section', () => {
        const edited = signed.replace('export const b = 2;\n', '');
        expect(verify(edited)).to.deep.equal({ status: 'valid' });
    });

    test('Valid with CRLF line breaks', () => {
        expect(verify(signed.replaceAll('\n', '\r\n'))).to.deep.equal({ status: 'valid' });
    });

    test('Invalid after editing outside a manual section', () => {
        expect(verify(signed.replace('a = 1', 'a = 10'))).to.deep.equal({ status: 'invalid' });
    });

    test('Invalid after renaming a manual section', () => {
        expect(verify(signed.replaceAll('custom', 'renamed'))).to.deep.equal({
            status: 'invalid',
        });
    });

    test('Invalid after changing the hash', () => {
        const changed = signed.replace(/(?<=v1:)[\da-f]/u, c => (c === 'a' ? 'b' : 'a'));
        expect(verify(changed)).to.deep.equal({ status: 'invalid' });
    });

    suite('Malformed', () => {
        test('Duplicate token', () => {
            const result = verify(`${signed}// ${token('a'.repeat(32))}\n`);
            expect(result.status).to.equal('malformed');
            expect(result).to.have.nested.property('error.reason', 'duplicate-signature');
            expect(result).to.have.nested.property('error.line', 7);
        });

        test('Unsupported version', () => {
            const result = verify(`// ${token('a'.repeat(32), '2')}\n`);
            expect(result).to.have.nested.property('error.reason', 'unsupported-version');
        });

        test('Broken manual section', () => {
            const result = verify(signed.replace('// @manual-end custom\n', ''));
            expect(result).to.have.nested.property('error.reason', 'unclosed-section');
        });

        test('Error is a malformed error', () => {
            const result = verify(`// ${token('a'.repeat(32), '2')}\n`);
            expect(result)
                .to.have.property('error')
                .that.is.instanceOf(GeneratedSignatureMalformedError);
        });
    });
});
