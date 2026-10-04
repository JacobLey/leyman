import { expect } from 'chai';
import { suite, test } from 'mocha';
import { assertIsPackageJson } from '#internal/lib/package-json-schema.js';

suite('assertIsPackageJson', () => {
    test('is package.json', () => {
        expect(() => {
            assertIsPackageJson({
                name: '<name>',
                dependencies: {
                    foo: '<foo>',
                    bar: '<bar>',
                },
                optionalDependencies: {
                    abc: '<xyz>',
                },
                extra: true,
            });
        }).not.to.throw();
    });

    test('is not package.json', () => {
        expect(() => {
            assertIsPackageJson({
                dependencies: {
                    foo: '<foo>',
                    bar: '<bar>',
                },
            });
        })
            .to.throw(Error, 'Not a valid package.json file')
            .with.property('message')
            .that.includes("must have required property 'name'");
    });

    test('Dependency versions must be strings', () => {
        expect(() => {
            assertIsPackageJson({
                name: '<name>',
                devDependencies: {
                    foo: 123,
                },
            });
        })
            .to.throw(Error, 'Not a valid package.json file')
            .with.property('message')
            .that.includes('/devDependencies/foo');
    });
});
