import { expect } from 'chai';
import { suite, test } from 'mocha-hookup';
import * as Processor from '../../../../executors/lifecycle/processor.js';

/**
 * Ensure inputs are never modified.
 *
 * @param obj - value to freeze recursively
 */
const deepFreeze = <T>(obj: T): T => {
    if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
        // eslint-disable-next-line guard-for-in
        for (const key in obj) {
            deepFreeze(obj[key]);
        }
    }
    return obj;
};

const idempotentAssertion = ({
    params,
    expected,
}: {
    params: Parameters<typeof Processor.processNxAndProjectJsons>[0];
    expected: ReturnType<typeof Processor.processNxAndProjectJsons>;
}) => {
    const result = Processor.processNxAndProjectJsons(deepFreeze(params));
    expect(result).to.deep.equal(expected, 'Result is expected');

    const idempotentResult = Processor.processNxAndProjectJsons(
        deepFreeze({
            options: params.options,
            nxJson: result.processedNxJson,
            projectJsons: result.processedProjectJsons,
        })
    );

    expect(idempotentResult).to.deep.equal(expected, 'Result is idempotent');

    // Assert serialization order as well
    const stringifiedExpected = JSON.stringify(expected, null, 2);
    expect(JSON.stringify(result, null, 2)).to.deep.equal(
        stringifiedExpected,
        'Result attributes are in order provided'
    );

    expect(JSON.stringify(idempotentResult, null, 2)).to.equal(
        stringifiedExpected,
        'Idempotent result attributes are in order provided'
    );
};

suite('Processor', () => {
    suite('processNxAndProjectJsons', () => {
        test('Adds dependencies for standalone stage', () => {
            idempotentAssertion({
                params: {
                    options: {
                        stages: {
                            standalone: {},
                            second: {
                                dependsOn: ['standalone'],
                            },
                        },
                        bindings: {
                            withStage: 'standalone',
                            withStage2: 'standalone',
                        },
                    },
                    nxJson: {
                        foo: 'bar',
                        targetDefaults: {
                            unchanged: {},
                            alsoUnchanged: { dependsOn: [] },
                            withStage: {},
                        },
                    },
                    projectJsons: [
                        {
                            targets: {
                                withStage: {},
                            },
                        },
                        {
                            targets: {
                                withStage2: {
                                    dependsOn: ['some', 'other', 'tasks'],
                                },
                            },
                        },
                    ],
                },
                expected: {
                    processedNxJson: {
                        foo: 'bar',
                        targetDefaults: {
                            unchanged: {},
                            alsoUnchanged: { dependsOn: [] },
                            withStage: {
                                dependsOn: ['standalone:_'],
                            },
                            withStage2: {
                                dependsOn: ['standalone:_'],
                            },
                            'standalone:_': {
                                executor: 'nx:noop',
                                configurations: { __lifecycle: {} },
                            },
                            standalone: {
                                executor: 'nx:noop',
                                dependsOn: ['standalone:_', 'withStage', 'withStage2'],
                                configurations: { __lifecycle: {} },
                            },
                            'second:_': {
                                executor: 'nx:noop',
                                dependsOn: ['standalone'],
                                configurations: { __lifecycle: {} },
                            },
                            second: {
                                executor: 'nx:noop',
                                dependsOn: ['second:_'],
                                configurations: { __lifecycle: {} },
                            },
                        },
                    },
                    processedProjectJsons: [
                        {
                            targets: {
                                withStage: {},
                                'standalone:_': {},
                                standalone: {},
                                'second:_': {},
                                second: {},
                            },
                        },
                        {
                            targets: {
                                withStage2: {
                                    dependsOn: ['some', 'other', 'tasks', 'standalone:_'],
                                },
                                'standalone:_': {},
                                standalone: {},
                                'second:_': {},
                                second: {},
                            },
                        },
                    ],
                },
            });
        });

        test('Adds dependencies for stage with hooks', () => {
            idempotentAssertion({
                params: {
                    options: {
                        stages: {
                            firstStage: {
                                hooks: ['first', 'second'],
                                dependsOn: [
                                    {
                                        dependencies: true,
                                        target: 'some-other',
                                    },
                                ],
                            },
                            secondStage: {
                                hooks: ['only'],
                                dependsOn: ['firstStage'],
                            },
                        },
                        bindings: {
                            withStage1: 'firstStage:first',
                            withStage2: 'firstStage:second',
                            withSecondStage1: 'secondStage:only',
                        },
                    },
                    nxJson: {},
                    projectJsons: [{}],
                },
                expected: {
                    processedNxJson: {
                        targetDefaults: {
                            withStage1: {
                                dependsOn: ['firstStage:_'],
                            },
                            withStage2: {
                                dependsOn: ['firstStage:first'],
                            },
                            withSecondStage1: {
                                dependsOn: ['secondStage:_'],
                            },
                            'firstStage:_': {
                                executor: 'nx:noop',
                                dependsOn: [
                                    {
                                        dependencies: true,
                                        target: 'some-other',
                                    },
                                ],
                                configurations: { __lifecycle: {} },
                            },
                            'firstStage:first': {
                                executor: 'nx:noop',
                                dependsOn: ['firstStage:_', 'withStage1'],
                                configurations: { __lifecycle: {} },
                            },
                            'firstStage:second': {
                                executor: 'nx:noop',
                                dependsOn: ['firstStage:first', 'withStage2'],
                                configurations: { __lifecycle: {} },
                            },
                            firstStage: {
                                executor: 'nx:noop',
                                dependsOn: ['firstStage:second'],
                                configurations: { __lifecycle: {} },
                            },
                            'secondStage:_': {
                                executor: 'nx:noop',
                                dependsOn: ['firstStage'],
                                configurations: { __lifecycle: {} },
                            },
                            'secondStage:only': {
                                executor: 'nx:noop',
                                dependsOn: ['secondStage:_', 'withSecondStage1'],
                                configurations: { __lifecycle: {} },
                            },
                            secondStage: {
                                executor: 'nx:noop',
                                dependsOn: ['secondStage:only'],
                                configurations: { __lifecycle: {} },
                            },
                        },
                    },
                    processedProjectJsons: [
                        {
                            targets: {
                                'firstStage:_': {},
                                'firstStage:first': {},
                                'firstStage:second': {},
                                firstStage: {},
                                'secondStage:_': {},
                                'secondStage:only': {},
                                secondStage: {},
                            },
                        },
                    ],
                },
            });
        });

        test('Removes old lifecycle targets', () => {
            idempotentAssertion({
                params: {
                    options: {
                        stages: {
                            newStage: {
                                hooks: ['newHook'],
                            },
                        },
                        bindings: {
                            myTarget: 'newStage:newHook',
                        },
                    },
                    nxJson: {
                        targetDefaults: {
                            ignoredTarget: {},
                            'oldStage:oldHook': {
                                configurations: {
                                    __lifecycle: {},
                                },
                            },
                            oldStage: {
                                configurations: {
                                    __lifecycle: {},
                                },
                                dependsOn: ['oldStage:oldHook', 'ignoredTarget'],
                            },
                        },
                    },
                    projectJsons: [
                        {
                            targets: {
                                ignoredTarget: {},
                                'oldStage:oldHook': {
                                    configurations: {},
                                },
                                oldStage: {
                                    dependsOn: ['ignored'],
                                },
                                myTarget: {
                                    dependsOn: ['ignoredTarget'],
                                },
                            },
                        },
                    ],
                },
                expected: {
                    processedNxJson: {
                        targetDefaults: {
                            ignoredTarget: {},
                            myTarget: {
                                dependsOn: ['newStage:_'],
                            },
                            'newStage:_': {
                                executor: 'nx:noop',
                                configurations: {
                                    __lifecycle: {},
                                },
                            },
                            'newStage:newHook': {
                                executor: 'nx:noop',
                                dependsOn: ['newStage:_', 'myTarget'],
                                configurations: {
                                    __lifecycle: {},
                                },
                            },
                            newStage: {
                                executor: 'nx:noop',
                                dependsOn: ['newStage:newHook'],
                                configurations: {
                                    __lifecycle: {},
                                },
                            },
                        },
                    },
                    processedProjectJsons: [
                        {
                            targets: {
                                ignoredTarget: {},
                                myTarget: {
                                    dependsOn: ['ignoredTarget', 'newStage:_'],
                                },
                                'newStage:_': {},
                                'newStage:newHook': {},
                                newStage: {},
                            },
                        },
                    ],
                },
            });
        });

        suite('Does not add or remove extra fields', () => {
            test('Does not add targets', () => {
                idempotentAssertion({
                    params: {
                        options: {
                            stages: {},
                            bindings: {},
                        },
                        nxJson: {
                            foo: 'bar',
                        },
                        projectJsons: [
                            {
                                name: '<name>',
                            },
                        ],
                    },
                    expected: {
                        processedNxJson: {
                            foo: 'bar',
                        },
                        processedProjectJsons: [
                            {
                                name: '<name>',
                            },
                        ],
                    },
                });
            });

            test('Does not add dependsOn', () => {
                idempotentAssertion({
                    params: {
                        options: {
                            stages: {
                                standalone: {
                                    dependsOn: [],
                                },
                            },
                            bindings: {},
                        },
                        nxJson: {
                            foo: 'bar',
                            targetDefaults: {
                                myTarget: {},
                            },
                        },
                        projectJsons: [
                            {
                                targets: {
                                    otherTarget: {},
                                },
                            },
                        ],
                    },
                    expected: {
                        processedNxJson: {
                            foo: 'bar',
                            targetDefaults: {
                                myTarget: {},
                                'standalone:_': {
                                    executor: 'nx:noop',
                                    configurations: { __lifecycle: {} },
                                },
                                standalone: {
                                    executor: 'nx:noop',
                                    dependsOn: ['standalone:_'],
                                    configurations: { __lifecycle: {} },
                                },
                            },
                        },
                        processedProjectJsons: [
                            {
                                targets: {
                                    otherTarget: {},
                                    'standalone:_': {},
                                    standalone: {},
                                },
                            },
                        ],
                    },
                });
            });

            test('Does not remove targets', () => {
                idempotentAssertion({
                    params: {
                        options: {
                            stages: {},
                            bindings: {},
                        },
                        nxJson: {
                            foo: 'bar',
                            targetDefaults: {},
                        },
                        projectJsons: [
                            {
                                targets: {},
                            },
                        ],
                    },
                    expected: {
                        processedNxJson: {
                            foo: 'bar',
                            targetDefaults: {},
                        },
                        processedProjectJsons: [
                            {
                                targets: {},
                            },
                        ],
                    },
                });
            });

            test('Does not remove dependsOn', () => {
                idempotentAssertion({
                    params: {
                        options: {
                            stages: {
                                standalone: {},
                            },
                            bindings: {
                                withHook: 'standalone',
                            },
                        },
                        nxJson: {
                            foo: 'bar',
                            targetDefaults: {
                                someTarget: {
                                    executor: '<executor>',
                                    dependsOn: ['standalone:_'],
                                },
                                someOtherTarget: {
                                    configurations: {
                                        foo: { bar: true },
                                    },
                                },
                                withHook: {
                                    dependsOn: [],
                                },
                                withoutHook: {
                                    dependsOn: [],
                                },
                            },
                        },
                        projectJsons: [
                            {
                                targets: {
                                    someTarget: {
                                        dependsOn: [],
                                        configurations: {},
                                    },
                                    withHook: {},
                                    withoutHook: {
                                        executor: '<executor>',
                                        dependsOn: [],
                                    },
                                },
                            },
                        ],
                    },
                    expected: {
                        processedNxJson: {
                            foo: 'bar',
                            targetDefaults: {
                                someTarget: {
                                    executor: '<executor>',
                                    dependsOn: [],
                                },
                                someOtherTarget: {
                                    configurations: {
                                        foo: { bar: true },
                                    },
                                },
                                withHook: {
                                    dependsOn: ['standalone:_'],
                                },
                                withoutHook: {
                                    dependsOn: [],
                                },
                                'standalone:_': {
                                    executor: 'nx:noop',
                                    configurations: {
                                        __lifecycle: {},
                                    },
                                },
                                standalone: {
                                    executor: 'nx:noop',
                                    dependsOn: ['standalone:_', 'withHook'],
                                    configurations: {
                                        __lifecycle: {},
                                    },
                                },
                            },
                        },
                        processedProjectJsons: [
                            {
                                targets: {
                                    someTarget: {
                                        dependsOn: [],
                                        configurations: {},
                                    },
                                    withHook: {},
                                    withoutHook: {
                                        executor: '<executor>',
                                        dependsOn: [],
                                    },
                                    'standalone:_': {},
                                    standalone: {},
                                },
                            },
                        ],
                    },
                });
            });
        });

        suite('failure', () => {
            test('Overlap between stage and nx.json target', () => {
                expect(() => {
                    Processor.processNxAndProjectJsons(
                        deepFreeze({
                            options: {
                                stages: {
                                    overlap: {},
                                },
                                bindings: {},
                            },
                            nxJson: {
                                targetDefaults: {
                                    overlap: {},
                                },
                            },
                            projectJsons: [{}],
                        })
                    );
                }).to.throw('Overlap in lifecycle hook and target: overlap');
            });

            test('Overlap between stage and registered target', () => {
                expect(() => {
                    Processor.processNxAndProjectJsons(
                        deepFreeze({
                            options: {
                                stages: {
                                    overlap: {},
                                },
                                bindings: {
                                    overlap: 'overlap',
                                },
                            },
                            nxJson: {},
                            projectJsons: [{}],
                        })
                    );
                }).to.throw('Overlap in lifecycle hook and target: overlap');
            });

            test('Registered stage does not exist', () => {
                expect(() => {
                    Processor.processNxAndProjectJsons(
                        deepFreeze({
                            options: {
                                stages: {
                                    myStage: {},
                                },
                                bindings: {
                                    myTarget: 'doesNotExist',
                                },
                            },
                            nxJson: {},
                            projectJsons: [{}],
                        })
                    );
                }).to.throw('Hook for target myTarget not found: doesNotExist');
            });

            test('Registered stage is anchor', () => {
                expect(() => {
                    Processor.processNxAndProjectJsons(
                        deepFreeze({
                            options: {
                                stages: {
                                    myStage: {},
                                },
                                bindings: {
                                    myTarget: 'myStage:_',
                                },
                            },
                            nxJson: {},
                            projectJsons: [{}],
                        })
                    );
                }).to.throw('Target myTarget cannot be part of anchor hook myStage:_');
            });

            test('Registered stage is has hooks', () => {
                expect(() => {
                    Processor.processNxAndProjectJsons(
                        deepFreeze({
                            options: {
                                stages: {
                                    myStage: {
                                        hooks: ['hookName'],
                                    },
                                },
                                bindings: {
                                    myTarget: 'myStage',
                                },
                            },
                            nxJson: {},
                            projectJsons: [{}],
                        })
                    );
                }).to.throw(
                    'Target myTarget cannot be part of base hook myStage. Use format myStage:<hook>'
                );
            });

            test('Stage depends on stage internals', () => {
                expect(() => {
                    Processor.processNxAndProjectJsons(
                        deepFreeze({
                            options: {
                                stages: {
                                    firstStage: {},
                                    secondStage: {
                                        dependsOn: ['firstStage:_'],
                                    },
                                },
                                bindings: {},
                            },
                            nxJson: {},
                            projectJsons: [{}],
                        })
                    );
                }).to.throw('Invalid dependency detected on lifecycle stage secondStage');
            });
        });
    });
});
