import type { Container, GenericBinding, GenericHaywireId, Module } from 'haywire';
import { expect } from '@leyman/expect';
import {
    bind,
    createContainer,
    createModule,
    eagerRequestScope,
    eagerSingletonScope,
    identifier,
} from 'haywire';
import { suite, test } from 'mocha-chain';

suite('Wiring', () => {
    suite('Eager request order', () => {
        const a = identifier<string>().named('a');
        const b = identifier<string>().named('b');
        const firstEager = identifier<string>().named('firstEager');
        const secondEager = identifier<string>().named('secondEager');
        const root = identifier<string>().named('root');
        const recorder = () => {
            const created: string[] = [];
            return {
                created,
                create: (name: string) => () => {
                    created.push(name);
                    return name;
                },
            };
        };

        test('A deferred cycle reaching each eager binding by two routes', () => {
            const { created, create } = recorder();

            const container = createContainer(
                createModule(bind(root).withDependencies([a, b]).withProvider(create('root')))
                    .addBinding(
                        bind(a)
                            .withDependencies([b.deferred(), firstEager])
                            .withProvider(create('a'))
                    )
                    .addBinding(
                        bind(b)
                            .withDependencies([a.deferred(), secondEager])
                            .withProvider(create('b'))
                    )
                    .addBinding(
                        bind(firstEager).withFactory(create('firstEager')).scoped(eagerRequestScope)
                    )
                    .addBinding(
                        bind(secondEager)
                            .withFactory(create('secondEager'))
                            .scoped(eagerRequestScope)
                    )
            );

            container.get(root);

            expect(created.slice(0, 2)).to.deep.equal(['secondEager', 'firstEager']);
        });

        test('A later list element is still walked when an earlier one reaches the list', () => {
            const list = identifier<string>().named('list').list();
            const { created, create } = recorder();

            const container = createContainer(
                createModule(bind(root).withDependencies([list]).withProvider(create('root')))
                    .addBinding(
                        bind(list).withDependencies([a]).withProvider(create('first element'))
                    )
                    .addBinding(
                        bind(list)
                            .withDependencies([firstEager])
                            .withProvider(create('second element'))
                    )
                    .addBinding(
                        bind(a).withDependencies([list.deferred()]).withProvider(create('a'))
                    )
                    .addBinding(
                        bind(firstEager).withFactory(create('firstEager')).scoped(eagerRequestScope)
                    )
            );

            container.get(root);

            expect(created[0]).to.equal('firstEager');
        });
    });

    /**
     * Walking every route takes tens of seconds at this depth, and a walk can't be interrupted, so a walk that
     * doubles per level fails Mocha's timeout once it returns, rather than hanging the run as a deeper chain would.
     *
     * Each level reaches the one below by two routes. Levels are added top first, so nothing is solved before it's walked.
     */
    suite('Each binding is walked once per root', () => {
        const defaultDepth = 24;
        // Each step of this walk is cheap enough that the default depth would return within the timeout
        const eagerSingletonDepth = 28;

        const levels = Array.from({ length: eagerSingletonDepth + 1 }, (_, index) =>
            identifier<number>(`level${index}`)
        );
        const rootId = identifier<number>('root');

        const chainOf = (
            edge: (id: GenericHaywireId) => GenericHaywireId,
            depth = defaultDepth
        ): GenericBinding[] => [
            ...levels.slice(0, depth).map((level, index) => {
                const below = edge(levels[index + 1]!);
                return bind(level)
                    .withDependencies([below, below.nullable()])
                    .withProvider(() => index) as GenericBinding;
            }),
            bind(levels[depth]!).withInstance(depth) as GenericBinding,
        ];

        const containerOf = (bindings: readonly GenericBinding[]): Container<never> => {
            let module: Module<any, any, any, boolean> = createModule(bindings[0]!);
            for (const binding of bindings.slice(1)) {
                module = module.addBinding(binding);
            }
            return createContainer(module as never);
        };

        test('Eager singletons', () => {
            // Only the walk for eager singletons follows suppliers that are synchronous and start their own request
            const container = containerOf([
                bind(rootId)
                    .withDependencies([
                        levels[0]!.supplier({
                            sync: true,
                            propagateScope: false,
                        }),
                    ])
                    .withProvider(() => 0)
                    .scoped(eagerSingletonScope) as GenericBinding,
                ...chainOf(
                    id => id.supplier({ sync: true, propagateScope: false }),
                    eagerSingletonDepth
                ),
            ]);

            expect(() => {
                container.wire();
            }).to.not.throw();
        });

        test('Eager requests', () => {
            // Only the walk for eager requests follows async suppliers that share the request
            const container = containerOf(
                chainOf(id => id.supplier({ sync: false, propagateScope: true }))
            );

            expect(() => {
                container.wire();
            }).to.not.throw();
        });

        test('Sync suppliers', () => {
            const container = containerOf([
                bind(rootId)
                    .withDependencies([
                        levels[0]!.supplier({
                            sync: true,
                            propagateScope: true,
                        }),
                    ])
                    .withProvider(() => 0) as GenericBinding,
                ...chainOf(id => id.supplier({ sync: true, propagateScope: true })),
            ]);

            expect(() => {
                container.check();
            }).to.not.throw();
        });

        test('Async implementations', () => {
            const container = containerOf(chainOf(id => id));

            expect(() => {
                container.wire();
            }).to.not.throw();
        });
    });
});
