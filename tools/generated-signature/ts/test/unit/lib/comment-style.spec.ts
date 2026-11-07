import { expect } from '@leyman/expect';
import { commentStyle } from 'generated-signature';
import { suite, test } from 'mocha-chain';

suite('commentStyle', () => {
    test('By extension', () => {
        expect(commentStyle('src/foo.ts')).to.deep.equal({ start: '//' });
    });

    test('Extension is case insensitive', () => {
        expect(commentStyle('README.MD')).to.deep.equal({ start: '<!--', end: '-->' });
    });

    test('Block comments', () => {
        expect(commentStyle('a.css')).to.deep.equal({ start: '/*', end: '*/' });
    });

    test('Hash comments', () => {
        expect(commentStyle('a.yaml')).to.deep.equal({ start: '#' });
    });

    test('Dash comments', () => {
        expect(commentStyle('a.sql')).to.deep.equal({ start: '--' });
    });

    test('By file name', () => {
        expect(commentStyle('/repo/Dockerfile')).to.deep.equal({ start: '#' });
    });

    test('Dot file', () => {
        expect(commentStyle('.gitignore')).to.deep.equal({ start: '#' });
    });

    test('By file name with a suffix', () => {
        expect(commentStyle('Dockerfile.dev')).to.deep.equal({ start: '#' });
    });

    test('Unknown', () => {
        expect(commentStyle('a.unknown')).to.equal(null);
    });

    test('No comments in JSON', () => {
        expect(commentStyle('package.json')).to.equal(null);
    });
});
