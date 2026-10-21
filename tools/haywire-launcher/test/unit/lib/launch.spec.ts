import type { Main } from 'entry-script';
import { fake, verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import EntryScript, { MainNotImplementedError } from 'entry-script';
import {
    bind,
    createContainer,
    createModule,
    HaywireContainerValidationError,
    HaywireProviderError,
    identifier,
    singletonScope,
} from 'haywire';
import { launch } from 'haywire-launcher';
import { afterEach, beforeEach, suite, test } from 'mocha-chain';

suite('launch', () => {
    const withFake = beforeEach(() => ({
        fakeMain: fake.returns<Parameters<Main['main']>, ReturnType<Main['main']>>(
            Promise.resolve()
        ),
    }));

    afterEach(() => {
        verifyAndRestore();
    });

    suite('Container returns EntryScript', () => {
        const withContainer = withFake.beforeEach(({ fakeMain }) => {
            class MyEntry extends EntryScript {
                public override main = fakeMain;
            }

            const container = createContainer(
                createModule(bind(EntryScript).withAsyncFactory(() => new MyEntry()))
            );

            return { container, myEntry: MyEntry };
        });

        withContainer.test('success', async ({ container, fakeMain, myEntry }) => {
            const entry = launch(container);

            expect(Object.prototype.isPrototypeOf.call(EntryScript, entry)).to.equal(true);
            expect(await entry.getOriginal()).to.be.an.instanceOf(myEntry);

            const args = ['--foo', 'bar'];
            await entry.main(args);

            expect(fakeMain.calledWith(args)).to.equal(true);
        });

        withContainer.test('Fails to instantiate via id', async ({ container }) => {
            // @ts-expect-error
            const entry = launch(container, identifier<EntryScript>());

            await expect(entry.main(['--foo', 'bar'])).to.be.rejectedWith(
                HaywireContainerValidationError
            );
        });
    });

    suite('Container returns Main', () => {
        const withContainer = withFake.beforeEach(({ fakeMain }) => {
            const id = identifier<Main>();
            const mainInstance = {
                main: fakeMain,
            };

            const container = createContainer(createModule(bind(id).withInstance(mainInstance)));

            return { container, id, mainInstance };
        });

        withContainer.test('success', async ({ container, fakeMain, id, mainInstance }) => {
            const entry = launch(container, id);

            expect(Object.prototype.isPrototypeOf.call(EntryScript, entry)).to.equal(true);
            expect(await entry.getOriginal()).to.equal(mainInstance);

            const args = ['--bar', 'foo'];
            await entry.main(args);

            expect(fakeMain.calledWith(args)).to.equal(true);
        });

        withContainer.test('Fails to instantiate with EntryScript', async ({ container }) => {
            // @ts-expect-error
            const entry = launch(container);

            await expect(entry.main(['--foo', 'bar'])).to.be.rejectedWith(
                HaywireContainerValidationError
            );
        });
    });

    suite('Container returns both EntryScript and Main', () => {
        const withContainerId = withFake.beforeEach(({ fakeMain }) => {
            class MyEntry extends EntryScript {
                public override main = fakeMain;
                public readonly hasId: boolean;
                public constructor(hasId = false) {
                    super();
                    this.hasId = hasId;
                }
            }
            const id = identifier<Main>();
            const staticId = id.named('static');

            const container = createContainer(
                createModule(bind(MyEntry).withConstructorFactory())
                    .addBinding(
                        bind(EntryScript)
                            .withDependencies([MyEntry])
                            .withProvider(x => x)
                    )
                    .addBinding(
                        bind(MyEntry)
                            .withFactory(() => new MyEntry(true))
                            .named('id')
                    )
                    .addBinding(
                        bind(id)
                            .withDependencies([identifier(MyEntry).named('id')])
                            .withProvider(x => x)
                    )
                    .addBinding(bind(staticId).withInstance(MyEntry))
            );

            return { container, id, myEntry: MyEntry };
        });

        withContainerId.test('No id provided, use EntryScript', async ({ container, fakeMain }) => {
            const entry = launch(container);

            expect(await entry.getOriginal()).to.contain({
                hasId: false,
            });

            const args = ['--foo', 'bar'];
            await entry.main(args);

            expect(fakeMain.calledWith(args)).to.equal(true);
        });

        withContainerId.test('Id provided, use custom', async ({ container, fakeMain, id }) => {
            const entry = launch(container, id);

            expect(await entry.getOriginal()).to.contain({
                hasId: true,
            });

            const args = ['--foo', 'bar'];
            await entry.main(args);

            expect(fakeMain.calledWith(args)).to.equal(true);
        });

        withContainerId.test(
            'Class provided, use its binding',
            async ({ container, fakeMain, myEntry }) => {
                const entry = launch(container, myEntry);

                expect(await entry.getOriginal())
                    .to.be.an.instanceOf(myEntry)
                    .that.contains({
                        hasId: false,
                    });

                const args = ['--foo', 'bar'];
                await entry.main(args);

                expect(fakeMain.calledWith(args)).to.equal(true);
            }
        );

        withContainerId.test('Returns not implemented class', async ({ container, id }) => {
            const entry = launch(container, id.named('static'));

            await expect(entry.main(['--foo', 'bar'])).to.be.rejectedWith(MainNotImplementedError);
        });
    });

    suite('dispose', () => {
        class Resource {
            public readonly resource = true;
        }

        const withContainer = beforeEach(() => {
            const failures: { main?: Error; dispose?: Error } = {};
            const fakeMain = fake<[string[]], Promise<void>>(async () => {
                if (failures.main) {
                    throw failures.main;
                }
            });
            const disposer = fake<[Resource], Promise<void>>(async () => {
                if (failures.dispose) {
                    throw failures.dispose;
                }
            });
            class Cli implements Main {
                public readonly resource: Resource;
                public main = fakeMain;
                public constructor(resource: Resource) {
                    this.resource = resource;
                }
            }
            const container = createContainer(
                createModule(
                    bind(Resource)
                        .withConstructorFactory()
                        .scoped(singletonScope)
                        .withDisposer(disposer)
                ).addBinding(bind(Cli).withDependencies([Resource]).withConstructorProvider())
            );
            return { cli: Cli, container, disposer, failures, fakeMain };
        });

        withContainer.test('Not disposed by default', async ({ cli, container, disposer }) => {
            await launch(container, cli).main([]);

            expect(disposer.called).to.equal(false);
            // Still usable
            expect(await container.getAsync(Resource)).to.be.an.instanceOf(Resource);
        });

        withContainer.test(
            'Disposed once main resolves',
            async ({ cli, container, disposer, fakeMain }) => {
                await launch(container, cli, { dispose: true }).main(['--foo']);

                expect(fakeMain.calledWith(['--foo'])).to.equal(true);
                expect(disposer.calledOnce).to.equal(true);
                expect(disposer.calledAfter(fakeMain)).to.equal(true);
            }
        );

        withContainer.test(
            'Disposed when main rejects',
            async ({ cli, container, disposer, failures }) => {
                const error = new Error('<main>');
                failures.main = error;

                await expect(launch(container, cli, { dispose: true }).main([])).to.be.rejectedWith(
                    error
                );
                expect(disposer.calledOnce).to.equal(true);
            }
        );

        withContainer.test(
            'Main and disposer both failing reject with both',
            async ({ cli, container, failures }) => {
                const mainError = new Error('<main>');
                const disposeError = new Error('<dispose>');
                failures.main = mainError;
                failures.dispose = disposeError;

                const thrown: unknown = await expect(
                    launch(container, cli, { dispose: true }).main([])
                ).to.be.rejectedWith(SuppressedError);
                expect(thrown).to.include({ error: disposeError, suppressed: mainError });
            }
        );

        test('Disposed when getting the instance fails', async () => {
            const disposer = fake.resolves<[Resource], Promise<void>>(undefined);
            const id = identifier<Main>();
            const container = createContainer(
                createModule(
                    bind(Resource)
                        .withConstructorFactory()
                        .scoped(singletonScope)
                        .withDisposer(disposer)
                ).addBinding(
                    bind(id)
                        .withDependencies([Resource])
                        .withProvider(() => {
                            throw new Error('<provider>');
                        })
                )
            );

            await expect(launch(container, id, { dispose: true }).main([])).to.be.rejectedWith(
                HaywireProviderError
            );
            expect(disposer.calledOnce).to.equal(true);
        });
    });

    // eslint-disable-next-line sonarjs/assertions-in-tests -- Type-only test, asserted by `@ts-expect-error`
    test('Container does not output Main', () => {
        const id = identifier<Main>();

        const container = createContainer(createModule(bind(id.nullable()).withInstance(null)));

        // @ts-expect-error
        launch<typeof container>(container);
        // @ts-expect-error
        launch<typeof container, typeof id>(container, id);
        // @ts-expect-error
        launch(container, id.nullable());

        class Unbound extends EntryScript {}
        // @ts-expect-error
        launch(container, Unbound);
    });
});
