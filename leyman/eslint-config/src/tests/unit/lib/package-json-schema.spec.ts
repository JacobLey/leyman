import { expect } from 'chai';
import { suite, test } from 'mocha';
import { assertIsPackageJson } from '../../../lib/package-json-schema.js';

suite('assertIsPackageJson', () => {
    test('is package.json', () => {
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
            .to.throw(Error)
            .that.contains({
                message: `Not a valid package.json file: ${JSON.stringify(
                    [
                        {
                            instancePath: '',
                            schemaPath: '#/required',
                            keyword: 'required',
                            params: {
                                missingProperty: 'name',
                            },
                            message: "must have required property 'name'",
                        },
                    ],
                    null,
                    2
                )}`,
            });
    });
});
