import type { WrapperComponent } from '@testing-library/react-hooks';
import type { ReactNode } from 'react';
import type { LinkOf } from 'normalized-react-query';
import {
    QueryClient,
    QueryClientProvider,
    skipToken,
    useQueries,
    useQueryClient,
    useSuspenseQueries,
} from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-hooks/server/index.js';
import { expect, expectAsync } from 'bupkis';
import { beforeEach, suite } from 'mocha-chain';
import {
    useNormalizedNullablePrefetchedSuspenseQuery,
    useNormalizedNullableSuspenseQuery,
    useNormalizedPrefetchedQuery,
    useNormalizedPrefetchedSuspenseQuery,
    useNormalizedPrefetchQuery,
    useNormalizedQuery,
    useNormalizedSuspenseQuery,
} from 'normalized-react-query';
import { Linked } from '../../lib/linked.js';
import { austenId, fellowshipOfTheRingId, prideAndPrejudiceId, tolkienId } from '../data/api.js';
import { authors, books } from '../data/normalized.js';

const authorsWithFavoriteAuthor = authors.propagate(author => ({
    ...author,
    favoriteAuthor: author.favoriteAuthor && authors.link(author.favoriteAuthor),
}));

suite('resource', () => {
    const context = beforeEach(() => {
        const client = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: Infinity,
                },
            },
        });
        return {
            client,
        };
    });

    suite('link', () => {
        context.test('From propagation', async ({ client }) => {
            const recursiveAuthor = authors.propagate(author =>
                authorsWithFavoriteAuthor.link({ authorId: author.id })
            );

            const tolkien = await recursiveAuthor.fetchQuery(client, {
                authorId: tolkienId,
            });

            expect(tolkien, 'to be an instance of', Linked);
            expect(tolkien.getQueryClient(), 'to equal', client);
            expect(tolkien.getQueryable(), 'to equal', authorsWithFavoriteAuthor);
            expect(tolkien.getParams(), 'to deep equal', { authorId: tolkienId });

            await tolkien
                .getQueryable()
                .getCachedQuery(tolkien.getQueryClient(), tolkien.getParams())!.promise;

            const tolkiensFavorite = tolkien
                .getQueryable()
                .getQueryData(tolkien.getQueryClient(), tolkien.getParams());
            expect(tolkiensFavorite?.favoriteAuthor, 'to deep equal', {
                authorId: austenId,
            });
        });

        context.test('Cannot be invoked directly', async () => {
            expect(() => authors.link({ authorId: tolkienId }), 'to throw');
        });
    });

    suite('get/setQueryData', () => {
        context.test('Set direct data', async ({ client }) => {
            const randomId = '<random-id>';
            const params = { authorId: randomId };
            const name = 'Joe Schmoe';

            expect(authors.getQueryState(client, params), 'to be undefined');

            authors.setQueryData(client, params, {
                name,
                id: randomId,
                favoriteAuthor: null,
            });

            const data = authors.getQueryData(client, params);
            expect(data, 'not to be falsy');
            expect(data!.name, 'to equal', name);

            const fetchedData = await authors.fetchQuery(client, params);
            expect(fetchedData.name, 'to equal', name);

            expect(authors.getQueryData(new QueryClient(), params), 'to be undefined');
        });

        context.test('Set populated data', async ({ client }) => {
            const authorId = '<author-id>';
            const authorParams = { authorId };
            const bookId = '<book-id>';
            const bookParams = { bookId };

            expect(authors.getQueryState(client, authorParams), 'to be falsy');
            expect(books.getQueryState(client, bookParams), 'to be falsy');

            expect(
                books.populate(client, bookParams, {
                    id: bookId,
                    title: '<title>',
                    author: authors.populate(client, authorParams, {
                        id: authorId,
                        name: '<name>',
                        favoriteAuthor: null,
                    }),
                }),
                'to equal',
                bookParams
            );

            const book = books.getQueryData(client, bookParams);
            expect(book, 'not to be undefined');
            expect(book!.author, 'to equal', authorParams);

            const author = authors.getQueryData(client, authorParams);
            expect(author, 'not to be undefined');
            expect(author!.name, 'to equal', '<name>');
        });
    });

    suite('fetchQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const author = await authors.fetchQuery(client, { authorId: tolkienId });

            expect(author.name, 'to equal', 'J.R.R. Tolkien');
            expect(authors.getQueryData(client, { authorId: tolkienId }), 'to equal', author);
        });

        context.test('Get populated data', async ({ client }) => {
            const bookParams = { bookId: fellowshipOfTheRingId };

            const fetchBook = books.fetchQuery(client, bookParams);
            expect(books.isFetching(client, bookParams), 'to be true');
            expect(books.hasState(client, bookParams), 'to be true');
            expect(books.hasData(client, bookParams), 'to be false');
            expect(books.getQueryState(client, bookParams), 'to be truthy');
            const book = await fetchBook;

            expect(book.title, 'to equal', 'Fellowship of the Ring');

            const fetchAuthor = authors.fetchQuery(client, book.author);
            expect(books.isFetching(client, { bookId: fellowshipOfTheRingId }), 'to be false');
            expect(books.hasData(client, bookParams), 'to be true');
            expect(books.getQueryState(client, bookParams), 'to be truthy');
            const author = await fetchAuthor;

            expect(author.name, 'to equal', 'J.R.R. Tolkien');
        });

        context.test('Throws when query throws', async ({ client }) => {
            await expectAsync(
                books.fetchQuery(client, { bookId: '<not-a-real-id>' }),
                'to be rejected'
            );
        });

        context.test('Does not throw when propagated throws', async ({ client }) => {
            const authorWithFakeFavoriteBook = authors.propagate(author => ({
                ...author,
                favoriteBook: books.link({ bookId: '<fake-book-id>' }),
            }));

            await expectAsync(
                authorWithFakeFavoriteBook.fetchQuery(client, { authorId: tolkienId }),
                'not to be rejected'
            );
        });

        context.test('Triggers downstream propagation', async ({ client }) => {
            await authorsWithFavoriteAuthor.fetchQuery(client, {
                authorId: tolkienId,
            });

            expect(authors.isFetching(client, { authorId: austenId }), 'to be true');
        });
    });

    suite('prefetchQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const linkedAuthor = await authors.prefetchQuery(client, { authorId: tolkienId });

            const author = authors.getQueryData(client, linkedAuthor.getParams());
            expect(author, 'not to be undefined');
            expect(author!.name, 'to equal', 'J.R.R. Tolkien');
        });

        context.test('Get populated data', async ({ client }) => {
            const linkedBook = await books.prefetchQuery(client, { bookId: fellowshipOfTheRingId });

            const book = books.getQueryData(client, linkedBook.getParams());
            expect(book, 'not to be undefined');
            expect(book!.title, 'to equal', 'Fellowship of the Ring');

            const author = authors.getQueryData(client, book!.author);
            expect(author, 'not to be undefined');
            expect(author!.name, 'to equal', 'J.R.R. Tolkien');
        });

        context.test('Does not propagate failure', async ({ client }) => {
            await books.prefetchQuery(client, { bookId: '<not-a-real-id>' });
        });

        context.test('Triggers downstream propagation', async ({ client }) => {
            await authorsWithFavoriteAuthor.prefetchQuery(client, {
                authorId: tolkienId,
            });

            expect(authors.isFetching(client, { authorId: austenId }), 'to be true');
        });
    });

    suite('ensureQueryData', () => {
        context.test('Does not reload existing data', async ({ client }) => {
            const bookId = '<book-id>';
            books.setQueryData(
                client,
                { bookId },
                {
                    id: bookId,
                    title: '<title>',
                    author: { authorId: '<random-id>' },
                }
            );

            const book = await books.ensureQueryData(client, { bookId });
            expect(book.title, 'to equal', '<title>');

            await expectAsync(authors.ensureQueryData(client, book.author), 'to be rejected');
        });

        context.test('Get populated data', async ({ client }) => {
            await books.ensureQueryData(client, {
                bookId: fellowshipOfTheRingId,
            });

            const book = books.getQueryData(client, {
                bookId: fellowshipOfTheRingId,
            });
            expect(book, 'to be truthy');
            expect(book!.title, 'to equal', 'Fellowship of the Ring');

            const author = authors.getQueryData(client, book!.author);
            expect(author, 'to be truthy');
            expect(author!.name, 'to equal', 'J.R.R. Tolkien');
        });

        context.test('Get propagated data', async ({ client }) => {
            await authorsWithFavoriteAuthor.ensureQueryData(client, {
                authorId: tolkienId,
            });

            const author = authorsWithFavoriteAuthor.getQueryData(client, { authorId: austenId });
            expect(author, 'to be truthy');
            expect(author!.name, 'to equal', 'Jane Austen');
        });

        context.test('Throws when failure', async ({ client }) => {
            await expectAsync(
                books.ensureQueryData(client, { bookId: '<book-id>' }),
                'to be rejected'
            );
        });

        context.test('Throws when propagated failure', async ({ client }) => {
            const authorWithFavoriteFakeBook = authors.propagate(author => ({
                ...author,
                favoriteBook: books.link({ bookId: '<book-id>' }),
            }));

            await expectAsync(
                authorWithFavoriteFakeBook.ensureQueryData(client, { authorId: tolkienId }),
                'to be rejected'
            );
        });

        context.test(
            'Does not throw when propagated failure isolates errors',
            async ({ client }) => {
                const authorWithFavoriteIsolatedFakeBook = authors.propagate(author => ({
                    ...author,
                    favoriteBook: books.link({ bookId: '<book-id>' }, { isolateErrors: true }),
                }));

                await expectAsync(
                    authorWithFavoriteIsolatedFakeBook.ensureQueryData(client, {
                        authorId: tolkienId,
                    }),
                    'not to be rejected'
                );
            }
        );
    });

    suite('hooks', () => {
        const contextWithWrapper = context.beforeEach(({ client }) => {
            const wrapper: WrapperComponent<{ children: ReactNode }> = ({ children }) => (
                <QueryClientProvider client={client}>{children}</QueryClientProvider>
            );
            return {
                wrapper,
            };
        });

        const bookWithAuthorsFavorite = books.propagate(book => ({
            ...book,
            author: authorsWithFavoriteAuthor.link(book.author),
        }));

        suite('useNormalizedQuery', () => {
            const useHook = ({ bookId }: { bookId: string }) => {
                const book = useNormalizedQuery(bookWithAuthorsFavorite, {
                    bookId,
                });

                const author = useNormalizedQuery(
                    authorsWithFavoriteAuthor,
                    book.data?.author.getParams() ?? skipToken,
                    {
                        initialData: {
                            id: '<fake-id>',
                            name: '<fake-name>',
                            favoriteAuthor: null,
                        },
                    }
                );

                const favoriteAuthor = useNormalizedQuery(
                    authors,
                    author.data?.favoriteAuthor?.getParams() ?? skipToken,
                    {
                        initialData: {
                            id: '<fake-id-2>',
                            name: '<fake-name-2>',
                            favoriteAuthor: null,
                        },
                    }
                );

                return {
                    book,
                    author,
                    favoriteAuthor,
                };
            };

            contextWithWrapper.test('Returns undefined when not loaded', ({ wrapper }) => {
                const { result } = renderHook(() => useHook({ bookId: fellowshipOfTheRingId }), {
                    wrapper,
                });

                expect(result.current.book.data, 'to be undefined');
                expect(result.current.author.data?.id, 'to be undefined');
                expect(result.current.favoriteAuthor.data, 'to be undefined');
            });

            contextWithWrapper.test('Returns data when preloaded', async ({ client, wrapper }) => {
                await Promise.all([
                    bookWithAuthorsFavorite.ensureQueryData(client, {
                        bookId: fellowshipOfTheRingId,
                    }),
                    bookWithAuthorsFavorite.ensureQueryData(client, {
                        bookId: prideAndPrejudiceId,
                    }),
                ]);

                const { result } = renderHook(
                    () =>
                        useHook({
                            bookId: fellowshipOfTheRingId,
                        }),
                    { wrapper }
                );

                expect(result.current.book.data?.id, 'to equal', fellowshipOfTheRingId);
                expect(result.current.author.data?.id, 'to equal', tolkienId);
                expect(result.current.favoriteAuthor.data?.id, 'to equal', austenId);

                const { result: result2 } = renderHook(
                    () =>
                        useHook({
                            bookId: prideAndPrejudiceId,
                        }),
                    { wrapper }
                );

                expect(result2.current.book.data?.id, 'to equal', prideAndPrejudiceId);
                expect(result2.current.author.data?.id, 'to equal', austenId);
                expect(result2.current.favoriteAuthor.data, 'to be undefined');
            });

            contextWithWrapper.test(
                'Respects initial data only when valid params',
                async ({ client, wrapper }) => {
                    await bookWithAuthorsFavorite.prefetchQuery(client, {
                        bookId: fellowshipOfTheRingId,
                    });

                    const { result } = renderHook(
                        () =>
                            useHook({
                                bookId: fellowshipOfTheRingId,
                            }),
                        { wrapper }
                    );

                    expect(result.current.book.data?.id, 'to equal', fellowshipOfTheRingId);
                    expect(result.current.author.data?.id, 'to equal', tolkienId);
                    expect(result.current.favoriteAuthor.data?.id, 'to equal', '<fake-id-2>');

                    await bookWithAuthorsFavorite.prefetchQuery(client, {
                        bookId: prideAndPrejudiceId,
                    });

                    const { result: result2 } = renderHook(
                        () =>
                            useHook({
                                bookId: prideAndPrejudiceId,
                            }),
                        { wrapper }
                    );

                    expect(result2.current.book.data?.id, 'to equal', prideAndPrejudiceId);
                    expect(result2.current.author.data?.id, 'to equal', austenId);
                    expect(result2.current.favoriteAuthor.data, 'to be undefined');
                }
            );
        });

        suite('getUseQueryOptions', () => {
            const useHook = () => {
                const qc = useQueryClient();
                return useQueries({
                    queries: [
                        books.getUseQueryOptions(qc, {
                            bookId: fellowshipOfTheRingId,
                        }),
                        bookWithAuthorsFavorite.getUseQueryOptions(
                            qc,
                            {
                                bookId: prideAndPrejudiceId,
                            },
                            {
                                select: pride => pride.author.getParams().authorId,
                            }
                        ),
                        authors.getUseQueryOptions(qc, skipToken, {
                            select: () => {
                                throw new Error('Does not run');
                            },
                        }),
                        authorsWithFavoriteAuthor.getUseQueryOptions(qc, {
                            authorId: tolkienId,
                        }),
                    ],
                    combine: ([fellowship, pride, skipped, tolkien]) => ({
                        fellowshipId: fellowship.data?.id,
                        austenId: pride.data,
                        skipped: skipped.data,
                        tolkienId: tolkien.data?.id,
                    }),
                });
            };

            contextWithWrapper.test('useQueries', async ({ client, wrapper }) => {
                let { result } = renderHook(() => useHook(), {
                    wrapper,
                });

                expect(result.current, 'to deep equal', {
                    fellowshipId: undefined,
                    austenId: undefined,
                    skipped: undefined,
                    tolkienId: undefined,
                });

                await Promise.all([
                    books.prefetchQuery(client, { bookId: fellowshipOfTheRingId }),
                    books.prefetchQuery(client, { bookId: prideAndPrejudiceId }),
                ]);

                ({ result } = renderHook(() => useHook(), {
                    wrapper,
                }));

                expect(result.current, 'to deep equal', {
                    austenId,
                    tolkienId,
                    fellowshipId: fellowshipOfTheRingId,
                    skipped: undefined,
                });
            });
        });

        suite('useNormalizedPrefetchedQuery', () => {
            const useHook = ({ bookId }: { bookId: string }) => {
                const prefetched = useNormalizedPrefetchQuery(bookWithAuthorsFavorite, { bookId });

                const book = useNormalizedPrefetchedQuery(prefetched);

                const author = useNormalizedPrefetchedQuery(book.data?.author ?? skipToken, {
                    initialData: {
                        id: '<fake-id>',
                        name: '<fake-name>',
                        favoriteAuthor: null,
                    },
                });

                const favoriteAuthor = useNormalizedPrefetchedQuery(
                    author.data?.favoriteAuthor ?? skipToken,
                    {
                        initialData: {
                            id: '<fake-id-2>',
                            name: '<fake-name-2>',
                            favoriteAuthor: null,
                        },
                    }
                );

                return {
                    book,
                    author,
                    favoriteAuthor,
                };
            };

            contextWithWrapper.test('Returns data once loaded', async ({ client, wrapper }) => {
                let { result } = renderHook(() => useHook({ bookId: fellowshipOfTheRingId }), {
                    wrapper,
                });

                expect(result.current.book.data, 'to be undefined');
                expect(result.current.author.data?.id, 'to be undefined');
                expect(result.current.favoriteAuthor.data, 'to be undefined');

                const query = bookWithAuthorsFavorite.getCachedQuery(client, {
                    bookId: fellowshipOfTheRingId,
                });
                expect(query, 'not to be undefined');
                await query!.promise;

                ({ result } = renderHook(() => useHook({ bookId: fellowshipOfTheRingId }), {
                    wrapper,
                }));

                expect(result.current.book.data?.id, 'to equal', fellowshipOfTheRingId);
                expect(result.current.author.data?.id, 'to equal', tolkienId);
                expect(result.current.favoriteAuthor.data?.id, 'to equal', '<fake-id-2>');
            });

            contextWithWrapper.test(
                'Returns more data when loading in parallel',
                async ({ client, wrapper }) => {
                    await bookWithAuthorsFavorite.prefetchQuery(client, {
                        bookId: prideAndPrejudiceId,
                    });

                    let { result } = renderHook(() => useHook({ bookId: fellowshipOfTheRingId }), {
                        wrapper,
                    });
                    expect(result.current.book.data, 'to be undefined');

                    const query = bookWithAuthorsFavorite.getCachedQuery(client, {
                        bookId: fellowshipOfTheRingId,
                    });
                    expect(query, 'not to be undefined');
                    await query!.promise;

                    ({ result } = renderHook(() => useHook({ bookId: fellowshipOfTheRingId }), {
                        wrapper,
                    }));

                    expect(result.current.book.data?.id, 'to equal', fellowshipOfTheRingId);
                    expect(result.current.author.data?.id, 'to equal', tolkienId);
                    expect(result.current.favoriteAuthor.data?.id, 'to equal', austenId);
                }
            );
        });

        suite('useNormalizedSuspenseQuery', () => {
            const useHook = () => {
                const book = useNormalizedSuspenseQuery(bookWithAuthorsFavorite, {
                    bookId: fellowshipOfTheRingId,
                });

                const author = useNormalizedSuspenseQuery(
                    authorsWithFavoriteAuthor,
                    book.data.author.getParams()
                );

                const favoriteAuthor = useNormalizedSuspenseQuery(
                    authors,
                    author.data.favoriteAuthor!.getParams()
                );

                return {
                    book,
                    author,
                    favoriteAuthor,
                };
            };

            contextWithWrapper.test(
                'Suspends as new data is loaded',
                async ({ client, wrapper }) => {
                    let prom: unknown;
                    let suspended = renderHook(
                        () => {
                            try {
                                return useHook();
                            } catch (err) {
                                prom = err;
                            }
                            return null;
                        },
                        { wrapper }
                    );
                    expect(suspended.result.current, 'to be null');

                    expect(prom, 'to be a', Promise);
                    expect(
                        books.getQueryState(client, { bookId: fellowshipOfTheRingId })?.fetchStatus,
                        'to equal',
                        'fetching'
                    );
                    expect(
                        authors.getQueryState(client, { authorId: tolkienId }),
                        'to be undefined'
                    );
                    expect(
                        authors.getQueryState(client, { authorId: austenId }),
                        'to be undefined'
                    );
                    await (prom as Promise<void>);
                    // eslint-disable-next-line require-atomic-updates -- explicitly want to reset before hook
                    prom = null;

                    suspended = renderHook(
                        () => {
                            try {
                                return useHook();
                            } catch (err) {
                                prom = err;
                            }
                            return null;
                        },
                        { wrapper }
                    );
                    expect(suspended.result.current, 'to be null');

                    expect(prom, 'to be a', Promise);
                    expect(
                        authors.getQueryState(client, { authorId: tolkienId })?.fetchStatus,
                        'to equal',
                        'idle'
                    );
                    expect(
                        authors.getQueryState(client, { authorId: austenId })?.fetchStatus,
                        'to equal',
                        'fetching'
                    );
                    await (prom as Promise<void>);

                    const { result } = renderHook(() => useHook(), { wrapper });

                    expect(result.current.book.data.id, 'to equal', fellowshipOfTheRingId);
                    expect(result.current.author.data.id, 'to equal', tolkienId);
                    expect(result.current.favoriteAuthor.data.id, 'to equal', austenId);
                }
            );
        });

        suite('getUseSuspenseQueryOptions', () => {
            const useHook = () => {
                const qc = useQueryClient();
                return useSuspenseQueries({
                    queries: [
                        books.getUseSuspenseQueryOptions(qc, {
                            bookId: fellowshipOfTheRingId,
                        }),
                        bookWithAuthorsFavorite.getUseSuspenseQueryOptions(
                            qc,
                            {
                                bookId: prideAndPrejudiceId,
                            },
                            {
                                select: pride => pride.author.getParams().authorId,
                            }
                        ),
                        authorsWithFavoriteAuthor.getUseSuspenseQueryOptions(qc, {
                            authorId: tolkienId,
                        }),
                    ],
                    combine: ([fellowship, pride, tolkien]) => ({
                        fellowshipId: fellowship.data.id,
                        austenId: pride.data,
                        tolkienId: tolkien.data.id,
                    }),
                });
            };

            contextWithWrapper.test('useSuspenseQueries', async ({ wrapper }) => {
                let prom: unknown;
                const suspended = renderHook(
                    () => {
                        try {
                            return useHook();
                        } catch (err) {
                            prom = err;
                        }
                        return null;
                    },
                    { wrapper }
                );
                expect(suspended.result.current, 'to be null');

                expect(prom, 'to be a', Promise);
                await (prom as Promise<void>);

                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current, 'to deep equal', {
                    austenId,
                    tolkienId,
                    fellowshipId: fellowshipOfTheRingId,
                });
            });
        });

        suite('useNormalizedNullableSuspenseQuery', () => {
            const useHook = () => {
                const book = useNormalizedNullableSuspenseQuery(bookWithAuthorsFavorite, {
                    bookId: prideAndPrejudiceId,
                });

                const author = useNormalizedNullableSuspenseQuery(
                    authorsWithFavoriteAuthor,
                    book!.data.author.getParams()
                );

                const favoriteAuthor = useNormalizedNullableSuspenseQuery(
                    authors,
                    author!.data.favoriteAuthor?.getParams() ?? skipToken
                );

                return {
                    book,
                    author,
                    favoriteAuthor,
                };
            };

            contextWithWrapper.test('Suspends only when loading', async ({ wrapper }) => {
                let prom: unknown;
                const suspended = renderHook(
                    () => {
                        try {
                            return useHook();
                        } catch (err) {
                            prom = err;
                        }
                        return null;
                    },
                    { wrapper }
                );
                expect(suspended.result.current, 'to be null');

                expect(prom, 'to be a', Promise);
                await (prom as Promise<void>);

                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current.book, 'not to be null');
                expect(result.current.book!.data.id, 'to equal', prideAndPrejudiceId);
                expect(result.current.author, 'not to be null');
                expect(result.current.author!.data.id, 'to equal', austenId);
                expect(result.current.favoriteAuthor, 'to be null');
            });
        });

        suite('useNormalizedPrefetchedSuspenseQuery', () => {
            const useHook = (prefetched: LinkOf<typeof bookWithAuthorsFavorite>) => {
                const book = useNormalizedPrefetchedSuspenseQuery(prefetched);

                const author = useNormalizedPrefetchedSuspenseQuery(book.data.author);

                const favoriteAuthor = useNormalizedPrefetchedSuspenseQuery(
                    author.data.favoriteAuthor!,
                    {
                        initialData: {
                            id: '<fake-id>',
                            name: '<fake-author>',
                            favoriteAuthor: null,
                        },
                    }
                );

                return {
                    book,
                    author,
                    favoriteAuthor,
                };
            };

            contextWithWrapper.test(
                'Suspends before data is loaded',
                async ({ client, wrapper }) => {
                    let prom: unknown;
                    const suspended = renderHook(
                        () => {
                            try {
                                const prefetched = useNormalizedPrefetchQuery(
                                    bookWithAuthorsFavorite,
                                    { bookId: fellowshipOfTheRingId }
                                );
                                return useHook(prefetched);
                            } catch (err) {
                                prom = err;
                            }
                            return null;
                        },
                        { wrapper }
                    );
                    expect(suspended.result.current, 'to be null');

                    expect(prom, 'to be a', Promise);
                    expect(
                        books.getQueryState(client, { bookId: fellowshipOfTheRingId })?.fetchStatus,
                        'to equal',
                        'fetching'
                    );
                    expect(
                        authors.getQueryState(client, { authorId: tolkienId }),
                        'to be undefined'
                    );

                    const [preload] = await Promise.all([
                        bookWithAuthorsFavorite.prefetchQuery(client, {
                            bookId: fellowshipOfTheRingId,
                        }),
                        prom as Promise<void>,
                    ]);

                    let { result } = renderHook(() => useHook(preload), { wrapper });

                    expect(result.current.book.data.id, 'to equal', fellowshipOfTheRingId);
                    expect(result.current.author.data.id, 'to equal', tolkienId);
                    expect(result.current.favoriteAuthor.data.id, 'to equal', '<fake-id>');

                    // Wait for existing subqueries to flush...
                    await Promise.all(
                        client
                            .getQueryCache()
                            .findAll()
                            .map(async x => x.promise)
                    );

                    ({ result } = renderHook(() => useHook(preload), { wrapper }));

                    expect(result.current.book.data.id, 'to equal', fellowshipOfTheRingId);
                    expect(result.current.author.data.id, 'to equal', tolkienId);
                    expect(result.current.favoriteAuthor.data.id, 'to equal', austenId);
                }
            );
        });

        suite('useNormalizedNullablePrefetchedSuspenseQuery', () => {
            const useHook = (prefetched: LinkOf<typeof bookWithAuthorsFavorite>) => {
                const book = useNormalizedNullablePrefetchedSuspenseQuery(prefetched);

                const author = useNormalizedNullablePrefetchedSuspenseQuery(book?.data.author);

                const favoriteAuthor = useNormalizedNullablePrefetchedSuspenseQuery(
                    author?.data.favoriteAuthor ?? skipToken,
                    {
                        initialData: {
                            id: '<fake-id>',
                            name: '<fake-author>',
                            favoriteAuthor: null,
                        },
                    }
                );

                return {
                    book,
                    author,
                    favoriteAuthor,
                };
            };

            contextWithWrapper.test(
                'Suspends before data is loaded',
                async ({ client, wrapper }) => {
                    let prom: unknown;
                    const suspended = renderHook(
                        () => {
                            try {
                                const prefetched = useNormalizedPrefetchQuery(
                                    bookWithAuthorsFavorite,
                                    { bookId: fellowshipOfTheRingId }
                                );
                                return useHook(prefetched);
                            } catch (err) {
                                prom = err;
                            }
                            return null;
                        },
                        { wrapper }
                    );

                    expect(suspended.result.current, 'to be null');
                    expect(prom, 'to be a', Promise);

                    const [fellowshipPreload] = await Promise.all([
                        bookWithAuthorsFavorite.prefetchQuery(client, {
                            bookId: fellowshipOfTheRingId,
                        }),
                        prom as Promise<void>,
                    ]);

                    let { result } = renderHook(() => useHook(fellowshipPreload), { wrapper });

                    expect(result.current.book?.data.id, 'to equal', fellowshipOfTheRingId);
                    expect(result.current.author?.data.id, 'to equal', tolkienId);
                    expect(result.current.favoriteAuthor?.data.id, 'to equal', '<fake-id>');

                    const pridePreload = await bookWithAuthorsFavorite.prefetchQuery(client, {
                        bookId: prideAndPrejudiceId,
                    });

                    ({ result } = renderHook(() => useHook(pridePreload), { wrapper }));

                    expect(result.current.book?.data.id, 'to equal', prideAndPrejudiceId);
                    expect(result.current.author?.data.id, 'to equal', austenId);
                    expect(result.current.favoriteAuthor, 'to be null');

                    ({ result } = renderHook(() => useHook(fellowshipPreload), { wrapper }));

                    expect(result.current.book?.data.id, 'to equal', fellowshipOfTheRingId);
                    expect(result.current.author?.data.id, 'to equal', tolkienId);
                    expect(result.current.favoriteAuthor?.data.id, 'to equal', austenId);
                }
            );
        });
    });
});
