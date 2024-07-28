import { fake, verifyAndRestore } from 'sinon';
import EntryScript, { type Main, MainNotImplementedError } from 'entry-script';
import {
    bind,
    createContainer,
    createModule,
    HaywireContainerValidationError,
    identifier,
} from 'haywire';
import { launch } from 'haywire-launcher';
import { afterEach, beforeEach, suite, test } from 'mocha-hookup';
import { expect } from '../../chai-hooks.js';

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
                createModule(bind(EntryScript).withAsyncGenerator(() => new MyEntry()))
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

            await expect(entry.main(['--foo', 'bar'])).to.eventually.be.rejectedWith(
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

            await expect(entry.main(['--foo', 'bar'])).to.eventually.be.rejectedWith(
                HaywireContainerValidationError
            );
        });
    });

    suite('Container returns both EntryScript and Main', () => {
        const withContainerId = withFake.beforeEach(({ fakeMain }) => {
            class MyEntry extends EntryScript {
                public override main = fakeMain;
                public readonly withId: boolean;
                public constructor(withId = false) {
                    super();
                    this.withId = withId;
                }
            }
            const id = identifier<Main>();
            const staticId = id.named('static');

            const container = createContainer(
                createModule(bind(MyEntry).withConstructorGenerator())
                    .addBinding(
                        bind(EntryScript)
                            .withDependencies([MyEntry])
                            .withProvider(x => x)
                    )
                    .addBinding(
                        bind(MyEntry)
                            .withGenerator(() => new MyEntry(true))
                            .named('id')
                    )
                    .addBinding(
                        bind(id)
                            .withDependencies([identifier(MyEntry).named('id')])
                            .withProvider(x => x)
                    )
                    .addBinding(bind(staticId).withInstance(MyEntry))
            );

            return { container, id };
        });

        withContainerId.test('No id provided, use EntryScript', async ({ container, fakeMain }) => {
            const entry = launch(container);

            expect(await entry.getOriginal()).to.contain({
                withId: false,
            });

            const args = ['--foo', 'bar'];
            await entry.main(args);

            expect(fakeMain.calledWith(args)).to.equal(true);
        });

        withContainerId.test('Id provided, use custom', async ({ container, fakeMain, id }) => {
            const entry = launch(container, id);

            expect(await entry.getOriginal()).to.contain({
                withId: true,
            });

            const args = ['--foo', 'bar'];
            await entry.main(args);

            expect(fakeMain.calledWith(args)).to.equal(true);
        });

        withContainerId.test('Returns not implemented class', async ({ container, id }) => {
            const entry = launch(container, id.named('static'));

            await expect(entry.main(['--foo', 'bar'])).to.eventually.be.rejectedWith(
                MainNotImplementedError
            );
        });
    });

    test('Container does not output Main', () => {
        const id = identifier<Main>();

        const container = createContainer(createModule(bind(id.nullable()).withInstance(null)));

        // @ts-expect-error
        launch<typeof container>(container);
        // @ts-expect-error
        launch<typeof container, typeof id>(container, id);
        // @ts-expect-error
        launch(container, id.nullable());
    });
});
