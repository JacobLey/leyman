import { expect } from 'chai';
import { suite, test } from 'mocha';
import { getInternalRegex } from '#internal/lib/internal-regex.js';

suite('getInternalRegex', () => {
    const internalRegex = getInternalRegex({
        name: '@scope/name',
        dependencies: {
            registry: '1.2.3',
            dep: 'workspace:^',
        },
        devDependencies: {
            'dev.dep': 'workspace:*',
        },
        optionalDependencies: {
            optional: 'workspace:^',
            'registry-optional': '>2',
        },
        peerDependencies: {
            '@other-scope/peer_2': 'workspace:^',
        },
    });

    test('Matches the package itself', () => {
        expect('@scope/name').to.match(internalRegex);
    });

    test('Matches workspace dependencies of every kind', () => {
        for (const packageName of ['dep', 'dev.dep', 'optional', '@other-scope/peer_2']) {
            expect(packageName).to.match(internalRegex);
        }
    });

    test('Matches export paths of internal packages', () => {
        expect('@scope/name/sub/path').to.match(internalRegex);
        expect('dep/sub').to.match(internalRegex);
    });

    test('Does not match registry dependencies', () => {
        expect('registry').to.not.match(internalRegex);
        expect('registry-optional').to.not.match(internalRegex);
    });

    test('Does not match packages that only share a prefix', () => {
        expect('dependency').to.not.match(internalRegex);
        expect('@scope/name-other').to.not.match(internalRegex);
    });

    test('Does not match package names inside a path', () => {
        expect('./dep').to.not.match(internalRegex);
        expect('other/dep').to.not.match(internalRegex);
    });

    test('Treats package names literally', () => {
        // `.` would match any character in a regex
        expect('devXdep').to.not.match(internalRegex);
    });
});
