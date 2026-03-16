import type { WrapperComponent } from '@testing-library/react-hooks';
import type { ReactNode } from 'react';
import type { LinkOf } from 'normalized-react-query';
import {
    QueryClient,
    QueryClientProvider,
    skipToken,
    useQueries,
    useQueryClient,
} from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-hooks/server/index.js';
import { expect, expectAsync } from 'bupkis';
import { beforeEach, suite } from 'mocha-chain';
import {
    useNormalizedInfiniteQuery,
    useNormalizedNullablePrefetchedSuspenseInfiniteQuery,
    useNormalizedNullableSuspenseInfiniteQuery,
    useNormalizedPrefetchedInfiniteQuery,
    useNormalizedPrefetchedSuspenseInfiniteQuery,
    useNormalizedPrefetchInfiniteQuery,
    useNormalizedSuspenseInfiniteQuery,
} from 'normalized-react-query';
import { Linked } from '../../lib/linked.js';
import {
    austenId,
    fellowshipOfTheRingId,
    kingId,
    longWalkId,
    orwellId,
    shiningId,
    tolkienId,
} from '../data/api.js';
import { authors, books, infiniteAuthors, infiniteBooksByAuthor } from '../data/normalized.js';

const booksWithAuthor = books.propagate(book => ({
    ...book,
    author: authors.link(book.author),
}));

const infiniteBooksWithAuthor = infiniteBooksByAuthor.propagate(({ page }) =>
    page.map(book => booksWithAuthor.link(book))
);

const infiniteAuthorsWithBooks = infiniteAuthors.propagate(({ page }) =>
    page.map(author => infiniteBooksWithAuthor.link(author, { pages: 10 }))
);

suite('infinite', () => {
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
            const authorsWithBooks = infiniteAuthors.propagate(({ page }) =>
                page.map(author => infiniteBooksByAuthor.link(author))
            );

            const authorWithBook = await authorsWithBooks.fetchInfiniteQuery(client);

            expect(authorWithBook.pages.flat(), 'to have length', 2);
            const [firstLink] = authorWithBook.pages.flat();
            expect(firstLink, 'to be an instance of', Linked);
            expect(firstLink!.getQueryClient(), 'to equal', client);
            expect(firstLink!.getQueryable(), 'to equal', infiniteBooksByAuthor);
            expect(firstLink!.getParams(), 'to deep equal', { authorId: tolkienId });

            await firstLink!
                .getQueryable()
                .getCachedQuery(firstLink!.getQueryClient(), firstLink!.getParams())!.promise;

            const tolkiensBooks = firstLink!
                .getQueryable()
                .getInfiniteQueryData(firstLink!.getQueryClient(), firstLink!.getParams())
                ?.pages.flat()
                .map(book => book.bookId);
            expect(tolkiensBooks, 'to have length', 2);
            expect(tolkiensBooks, 'to contain', fellowshipOfTheRingId);
        });

        context.test('Cannot be invoked directly', async () => {
            expect(() => infiniteBooksWithAuthor.link({ authorId: tolkienId }), 'to throw');
        });
    });

    suite('get/setInfiniteQueryData', () => {
        context.test('Set direct data', async ({ client }) => {
            const authorId = '<author-id>';
            const bookId = '<book-id>';

            expect(infiniteAuthorsWithBooks.getQueryState(client), 'to be undefined');
            expect(infiniteBooksWithAuthor.getQueryState(client, { authorId }), 'to be undefined');

            infiniteAuthorsWithBooks.setInfiniteQueryData(client, undefined, {
                pages: [[{ authorId }]],
                pageParams: [
                    {
                        offset: -1,
                    },
                ],
            });
            infiniteBooksWithAuthor.setInfiniteQueryData(
                client,
                { authorId },
                {
                    pages: [[{ bookId }]],
                    pageParams: [
                        {
                            offset: -1,
                        },
                    ],
                }
            );

            const listedAuthors = infiniteAuthorsWithBooks.getQueryState(client);
            expect(listedAuthors?.data?.pages[0]?.[0]?.authorId, 'to equal', authorId);
            const listedBooks = infiniteBooksWithAuthor.getQueryState(client, { authorId });
            expect(listedBooks?.data?.pages[0]?.[0]?.bookId, 'to equal', bookId);

            const fetchedData = await infiniteAuthorsWithBooks.fetchInfiniteQuery(client);
            expect(
                fetchedData.pages.flat().map(author => author.getParams().authorId),
                'to deep equal',
                [authorId]
            );

            expect(
                infiniteBooksWithAuthor.getQueryData(new QueryClient(), { authorId }),
                'to be undefined'
            );
        });

        context.test('Set populated data', async ({ client }) => {
            const authorId = '<author-id>';
            const bookId = '<book-id>';

            expect(infiniteAuthorsWithBooks.getQueryState(client), 'to be undefined');
            expect(infiniteBooksWithAuthor.getQueryState(client, { authorId }), 'to be undefined');

            expect(
                // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
                infiniteAuthorsWithBooks.populate(client, undefined, {
                    pages: [[{ authorId }]],
                    pageParams: [
                        {
                            offset: -1,
                        },
                    ],
                }),
                'to be undefined'
            );
            expect(
                infiniteBooksWithAuthor.populate(
                    client,
                    { authorId },
                    {
                        pages: [[{ bookId }]],
                        pageParams: [
                            {
                                offset: -1,
                            },
                        ],
                    }
                ),
                'to deep equal',
                { authorId }
            );

            const listedAuthors = infiniteAuthorsWithBooks.getQueryState(client);
            expect(listedAuthors?.data?.pages[0]?.[0]?.authorId, 'to equal', authorId);
            const listedBooks = infiniteBooksWithAuthor.getQueryState(client, { authorId });
            expect(listedBooks?.data?.pages[0]?.[0]?.bookId, 'to equal', bookId);
        });
    });

    suite('fetchInfiniteQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const listedAuthors = await infiniteAuthorsWithBooks.fetchInfiniteQuery(client);

            const authorId = listedAuthors.pages
                .flat()
                .map(author => author.getParams().authorId)[0]!;
            expect(authorId, 'to equal', tolkienId);

            const listedBooks = await infiniteBooksWithAuthor.fetchInfiniteQuery(
                client,
                {
                    authorId,
                },
                {
                    pages: 10,
                }
            );

            expect(listedBooks.pages, 'to have length', 3);
            const bookIds = listedBooks.pages.flat().map(book => book.getParams().bookId);

            expect(bookIds, 'to contain', fellowshipOfTheRingId);
        });

        context.test('Throws when query throws', async ({ client }) => {
            await expectAsync(
                infiniteBooksWithAuthor.fetchInfiniteQuery(client, { authorId: '<not-a-real-id>' }),
                'to be rejected'
            );
        });

        context.test('Does not throw when propagated throws', async ({ client }) => {
            const authorWithFakeFavoriteBook = infiniteBooksByAuthor.propagate(({ page }) =>
                page.map(book => authors.link({ authorId: book.bookId }))
            );

            await expectAsync(
                authorWithFakeFavoriteBook.fetchInfiniteQuery(client, { authorId: tolkienId }),
                'not to be rejected'
            );
        });

        context.test('Triggers downstream propagation', async ({ client }) => {
            infiniteAuthorsWithBooks.populate(client, undefined, {
                pages: [[{ authorId: tolkienId }]],
                pageParams: [
                    {
                        offset: -1,
                    },
                ],
            });

            await infiniteAuthorsWithBooks.fetchInfiniteQuery(client);

            expect(
                infiniteBooksWithAuthor.isFetching(client, { authorId: tolkienId }),
                'to be true'
            );
        });
    });

    suite('prefetchQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const linkedBooks = await infiniteBooksWithAuthor.prefetchInfiniteQuery(client, {
                authorId: tolkienId,
            });

            const listedBooks = infiniteBooksWithAuthor.getQueryData(
                client,
                linkedBooks.getParams()
            );
            expect(
                listedBooks?.pages.flat().map(book => book.bookId),
                'to contain',
                fellowshipOfTheRingId
            );
        });

        context.test('Get populated data', async ({ client }) => {
            await infiniteBooksWithAuthor.prefetchInfiniteQuery(client, { authorId: kingId });

            expect(books.hasState(client, { bookId: longWalkId }), 'to be false');

            await infiniteBooksWithAuthor.prefetchInfiniteQuery(
                client,
                { authorId: kingId },
                {
                    // Ignored second time around
                    pages: 10,
                }
            );

            expect(books.hasState(client, { bookId: longWalkId }), 'to be false');
        });

        context.test('Only respects options on initial load', async ({ client }) => {
            await infiniteBooksWithAuthor.prefetchInfiniteQuery(
                client,
                { authorId: kingId },
                {
                    pages: 10,
                }
            );

            const book = books.getQueryData(client, { bookId: longWalkId });
            expect(book?.title, 'to equal', 'The Long Walk');
        });

        context.test('Does not propagate failure', async ({ client }) => {
            await infiniteBooksWithAuthor.prefetchInfiniteQuery(client, {
                authorId: '<not-a-real-id>',
            });
        });

        context.test('Triggers downstream propagation', async ({ client }) => {
            await infiniteAuthorsWithBooks.prefetchInfiniteQuery(client, undefined, {
                pages: 10,
            });
            expect(infiniteBooksByAuthor.isFetching(client, { authorId: kingId }), 'to be true');
        });
    });

    suite('ensureQueryData', () => {
        context.test('Does not reload existing data', async ({ client }) => {
            const authorId = kingId;
            const bookId = longWalkId;

            infiniteAuthorsWithBooks.setInfiniteQueryData(client, undefined, {
                pages: [[{ authorId }]],
                pageParams: [
                    {
                        offset: -1,
                    },
                ],
            });
            infiniteBooksWithAuthor.setInfiniteQueryData(
                client,
                { authorId },
                {
                    pages: [[{ bookId }]],
                    pageParams: [
                        {
                            offset: -1,
                        },
                    ],
                }
            );

            await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client);

            expect(authors.getQueryData(client, { authorId })?.name, 'to equal', 'Stephen King');
            expect(authors.getQueryData(client, { authorId: tolkienId }), 'to be undefined');
            expect(books.getQueryData(client, { bookId })?.title, 'to equal', 'The Long Walk');
            expect(books.getQueryData(client, { bookId: shiningId }), 'to be undefined');
        });

        context.test('Get populated data', async ({ client }) => {
            await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client);

            expect(
                infiniteBooksByAuthor
                    .getQueryData(client, {
                        authorId: tolkienId,
                    })
                    ?.pages.flat(),
                'to have length',
                4
            );
            expect(
                books.getQueryData(client, {
                    bookId: fellowshipOfTheRingId,
                })?.title,
                'to equal',
                'Fellowship of the Ring'
            );

            expect(books.getQueryData(client, { bookId: longWalkId }), 'to be undefined');

            await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client, undefined, {
                // Not respected after initial load
                pages: 10,
            });
            expect(books.hasState(client, { bookId: longWalkId }), 'to be false');
        });

        context.test('Only respects options on initial load', async ({ client }) => {
            await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client, undefined, {
                pages: 10,
            });

            expect(
                books.getQueryData(client, { bookId: longWalkId })?.title,
                'to equal',
                'The Long Walk'
            );
        });

        context.test('Throws when failure', async ({ client }) => {
            await expectAsync(
                infiniteBooksByAuthor.ensureInfiniteQueryData(client, { authorId: '<author-id>' }),
                'to be rejected'
            );
        });

        context.test('Throws when propagated failure', async ({ client }) => {
            const infiniteBooksWithMoreBooks = infiniteBooksWithAuthor.propagate(({ page }) =>
                page.map(book => ({
                    book,
                    otherBooksInSeries: infiniteBooksByAuthor.link({ authorId: '<author-id>' }),
                }))
            );

            await expectAsync(
                infiniteBooksWithMoreBooks.ensureInfiniteQueryData(client, { authorId: austenId }),
                'to be rejected'
            );
        });

        context.test(
            'Does not throw when propagated failure isolates errors',
            async ({ client }) => {
                const infiniteBooksWithMoreBooks = infiniteBooksWithAuthor.propagate(({ page }) =>
                    page.map(book => ({
                        book,
                        otherBooksInSeries: infiniteBooksByAuthor.link(
                            { authorId: '<author-id>' },
                            { isolateErrors: true }
                        ),
                    }))
                );

                await expectAsync(
                    infiniteBooksWithMoreBooks.ensureInfiniteQueryData(client, {
                        authorId: austenId,
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

        suite('useNormalizedInfiniteQuery', () => {
            const useHook = () => {
                const listedAuthorsQuery = useNormalizedInfiniteQuery(
                    infiniteAuthorsWithBooks,
                    undefined
                );
                const listedAuthors = listedAuthorsQuery.data?.pages
                    .flat()
                    .map(author => author.getParams());

                const firstAuthor = listedAuthors?.[0];
                const lastAuthor = listedAuthors?.at(-1);

                const firstAuthorInfiniteBooks = useNormalizedInfiniteQuery(
                    infiniteBooksWithAuthor,
                    firstAuthor ?? skipToken
                ).data?.pages.flat();
                const lastAuthorInfiniteBooksQuery = useNormalizedInfiniteQuery(
                    infiniteBooksWithAuthor,
                    lastAuthor ?? skipToken
                ).data;
                const lastAuthorInfiniteBooks = lastAuthorInfiniteBooksQuery?.pages.flat();

                const qc = useQueryClient();
                const firstAuthorBookIds = useQueries({
                    queries:
                        firstAuthorInfiniteBooks?.map(book =>
                            books.getUseQueryOptions(qc, book.getParams())
                        ) ?? [],
                })
                    .map(book => book.data?.id)
                    .filter((x): x is string => typeof x === 'string');
                const lastAuthorBookIds = useQueries({
                    queries:
                        lastAuthorInfiniteBooks?.map(book =>
                            books.getUseQueryOptions(qc, book.getParams())
                        ) ?? [],
                })
                    .map(book => book.data?.id)
                    .filter((x): x is string => typeof x === 'string');

                return {
                    firstAuthor,
                    firstAuthorBookIds,
                    lastAuthor,
                    lastAuthorBookIds,
                    lastAuthorBookParams: lastAuthorInfiniteBooksQuery?.pageParams.map(
                        param => param.offset
                    ),
                    hasMoreAuthors: listedAuthorsQuery.hasNextPage,
                    hasPreviousAuthors: listedAuthorsQuery.hasPreviousPage,
                    fetchMoreAuthors: listedAuthorsQuery.fetchNextPage,
                };
            };

            contextWithWrapper.test('Returns undefined when not loaded', ({ wrapper }) => {
                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current, 'to deep equal', {
                    firstAuthor: undefined,
                    firstAuthorBookIds: [],
                    lastAuthor: undefined,
                    lastAuthorBookParams: undefined,
                    lastAuthorBookIds: [],
                    hasMoreAuthors: false,
                    hasPreviousAuthors: false,
                    fetchMoreAuthors: result.current.fetchMoreAuthors,
                });
            });

            contextWithWrapper.test('Returns data when preloaded', async ({ client, wrapper }) => {
                await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client);

                let { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current.firstAuthor, 'to deep equal', { authorId: tolkienId });
                expect(result.current.firstAuthorBookIds, 'to contain', fellowshipOfTheRingId);
                expect(result.current.lastAuthor, 'to deep equal', { authorId: orwellId });
                expect(result.current.lastAuthorBookParams, 'to deep equal', [0, 2]);
                expect(result.current.hasMoreAuthors, 'to equal', true);
                expect(result.current.hasPreviousAuthors, 'to equal', false);

                const oldFetchMore = result.current.fetchMoreAuthors;
                await oldFetchMore();

                ({ result } = renderHook(() => useHook(), { wrapper }));

                expect(result.current.firstAuthor, 'to deep equal', { authorId: tolkienId });
                expect(result.current.firstAuthorBookIds, 'to contain', fellowshipOfTheRingId);
                expect(result.current.lastAuthor, 'to deep equal', { authorId: kingId });
                expect(result.current.lastAuthorBookIds, 'to have length', 0);
                expect(result.current.hasMoreAuthors, 'to equal', true);
                expect(result.current.hasPreviousAuthors, 'to equal', false);

                await oldFetchMore();

                ({ result } = renderHook(() => useHook(), { wrapper }));

                expect(result.current.hasMoreAuthors, 'to equal', false);
            });

            contextWithWrapper.test(
                'Respects initial data only when valid params',
                async ({ wrapper }) => {
                    const { result } = renderHook(
                        () => {
                            const skipped = useNormalizedInfiniteQuery(
                                infiniteBooksWithAuthor,
                                skipToken,
                                {
                                    initialData: {
                                        pages: [[{ bookId: '<book-id-1>' }]],
                                        pageParams: [{ offset: -1 }],
                                    },
                                }
                            );

                            const initialized = useNormalizedInfiniteQuery(
                                infiniteBooksWithAuthor,
                                { authorId: '<author-id>' },
                                {
                                    initialData: {
                                        pages: [[{ bookId: '<book-id-2>' }]],
                                        pageParams: [{ offset: -2 }],
                                    },
                                }
                            );

                            return { skipped, initialized };
                        },
                        {
                            wrapper,
                        }
                    );

                    expect(result.current.skipped.data, 'to be undefined');
                    expect(
                        result.current.initialized.data?.pages
                            .flat()
                            .map(book => book.getParams().bookId),
                        'to deep equal',
                        ['<book-id-2>']
                    );
                }
            );
        });

        suite('useNormalizedPrefetchedInfiniteQuery', () => {
            const useHook = ({ pages }: { pages: number }) => {
                const prefetched = useNormalizedPrefetchInfiniteQuery(
                    infiniteAuthorsWithBooks,
                    undefined,
                    {
                        pages,
                    }
                );

                const listedAuthors = useNormalizedPrefetchedInfiniteQuery(prefetched, {
                    select: data => data.pages.flat(),
                });

                const listedBooks = useNormalizedPrefetchedInfiniteQuery(
                    listedAuthors.data?.[0] ?? skipToken,
                    {
                        select: data => data.pages.flat(),
                    }
                );

                return {
                    listedAuthors:
                        listedAuthors.data?.map(author => author.getParams().authorId) ?? null,
                    listedBooks: listedBooks.data?.map(book => book.getParams().bookId) ?? null,
                };
            };

            contextWithWrapper.test('Returns data once loaded', async ({ client, wrapper }) => {
                let { result } = renderHook(() => useHook({ pages: 1 }), {
                    wrapper,
                });

                expect(result.current, 'to deep equal', {
                    listedAuthors: null,
                    listedBooks: null,
                });

                const authorsQuery = infiniteAuthors.getCachedQuery(client);
                expect(authorsQuery, 'not to be undefined');
                await authorsQuery!.promise;

                ({ result } = renderHook(() => useHook({ pages: 1 }), {
                    wrapper,
                }));

                expect(result.current.listedAuthors, 'to contain', tolkienId);
                expect(result.current.listedAuthors, 'not to contain', kingId);
                expect(result.current.listedBooks, 'to be null');

                const booksQuery = infiniteBooksByAuthor.getCachedQuery(client, {
                    authorId: tolkienId,
                });
                expect(booksQuery, 'not to be undefined');
                await booksQuery!.promise;

                ({ result } = renderHook(() => useHook({ pages: 2 }), {
                    wrapper,
                }));

                expect(result.current.listedAuthors, 'to contain', tolkienId);
                expect(result.current.listedAuthors, 'not to contain', kingId);
                expect(result.current.listedBooks, 'to contain', fellowshipOfTheRingId);
            });

            contextWithWrapper.test('Allows returning empty', async ({ client, wrapper }) => {
                let { result } = renderHook(() => useHook({ pages: 0 }), {
                    wrapper,
                });

                expect(result.current, 'to deep equal', {
                    listedAuthors: null,
                    listedBooks: null,
                });

                await infiniteAuthors.ensureInfiniteQueryData(client, undefined, { pages: 2 });

                ({ result } = renderHook(() => useHook({ pages: 0 }), {
                    wrapper,
                }));

                expect(result.current, 'to deep equal', {
                    listedAuthors: [tolkienId, orwellId],
                    listedBooks: null,
                });

                ({ result } = renderHook(() => useHook({ pages: 2 }), {
                    wrapper,
                }));

                expect(result.current.listedAuthors, 'to contain', tolkienId);
                expect(result.current.listedAuthors, 'not to contain', kingId);
                // Because original page load was 0 pages, never propagated
                expect(result.current.listedBooks, 'to be null');

                expect(
                    infiniteBooksWithAuthor.getQueryState(client, { authorId: tolkienId })
                        ?.fetchStatus,
                    'to equal',
                    'fetching'
                );
            });
        });

        suite('useNormalizedSuspenseInfiniteQuery', () => {
            const useHook = () => {
                const listedAuthors = useNormalizedSuspenseInfiniteQuery(
                    infiniteAuthorsWithBooks,
                    undefined
                );

                const firstAuthor = listedAuthors.data.pages[0]![0]!.getParams();

                const listedBooks = useNormalizedSuspenseInfiniteQuery(
                    infiniteBooksByAuthor,
                    firstAuthor
                );

                return {
                    firstAuthor,
                    hasMoreAuthors: listedAuthors.hasNextPage,
                    loadMoreAuthors: listedAuthors.fetchNextPage,
                    listedBooks: listedBooks.data.pages.flat().map(book => book.bookId),
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
                        infiniteAuthors.getQueryState(client)?.fetchStatus,
                        'to equal',
                        'fetching'
                    );
                    expect(
                        infiniteBooksByAuthor.getQueryState(client, { authorId: tolkienId }),
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
                    expect(infiniteAuthors.getQueryState(client)?.fetchStatus, 'to equal', 'idle');
                    expect(
                        infiniteBooksByAuthor.getQueryState(client, { authorId: tolkienId })
                            ?.fetchStatus,
                        'to equal',
                        'fetching'
                    );
                    await (prom as Promise<void>);

                    const { result } = renderHook(() => useHook(), { wrapper });

                    expect(result.current.firstAuthor, 'to deep equal', { authorId: tolkienId });
                    expect(result.current.listedBooks, 'to contain', fellowshipOfTheRingId);
                    expect(result.current.hasMoreAuthors, 'to equal', true);
                    void result.current.loadMoreAuthors();

                    // Doesn't throw
                    renderHook(() => useHook(), { wrapper });
                }
            );
        });

        suite('useNormalizedNullableSuspenseInfiniteQuery', () => {
            const useHook = () => {
                const skipped = useNormalizedNullableSuspenseInfiniteQuery(
                    infiniteBooksWithAuthor,
                    skipToken
                );

                const listedBooks = useNormalizedNullableSuspenseInfiniteQuery(
                    infiniteBooksWithAuthor,
                    {
                        authorId: kingId,
                    },
                    {
                        select: data => data.pages.flat().map(book => book.getParams().bookId),
                    }
                );

                return {
                    skipped,
                    listedBooks: listedBooks?.data,
                };
            };

            contextWithWrapper.test('Suspends only when loading', async ({ client, wrapper }) => {
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

                let { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current.skipped, 'to be null');
                expect(result.current.listedBooks, 'to be truthy');
                expect(result.current.listedBooks, 'not to include', longWalkId);

                await infiniteBooksByAuthor.prefetchInfiniteQuery(
                    client,
                    { authorId: kingId },
                    {
                        pages: 5,
                    }
                );

                ({ result } = renderHook(() => useHook(), { wrapper }));

                expect(result.current.skipped, 'to be null');
                expect(result.current.listedBooks, 'to be truthy');
                expect(result.current.listedBooks, 'not to include', longWalkId);

                await infiniteBooksByAuthor.invalidateQuery(client, { authorId: kingId });
                await infiniteBooksByAuthor.prefetchInfiniteQuery(
                    client,
                    { authorId: kingId },
                    {
                        pages: 5,
                    }
                );

                ({ result } = renderHook(() => useHook(), { wrapper }));

                expect(result.current.listedBooks, 'to include', longWalkId);
            });
        });

        suite('useNormalizedPrefetchedSuspenseInfiniteQuery', () => {
            const useHook = (prefetched: LinkOf<typeof infiniteAuthorsWithBooks>) => {
                const listedAuthors = useNormalizedPrefetchedSuspenseInfiniteQuery(prefetched, {
                    select: data => data.pages.flat(),
                });

                const listedBooks = useNormalizedPrefetchedSuspenseInfiniteQuery(
                    listedAuthors.data[0]!,
                    {
                        initialData: {
                            pages: [
                                [
                                    {
                                        bookId: longWalkId,
                                    },
                                ],
                            ],
                            pageParams: [{ offset: -1 }],
                        },
                        select: data => data.pages.flat().map(book => book.getParams().bookId),
                    }
                );

                return {
                    listedAuthors: listedAuthors.data,
                    listedBooks: listedBooks.data,
                };
            };

            contextWithWrapper.test(
                'Suspends before data is loaded',
                async ({ client, wrapper }) => {
                    let prom: unknown;
                    const suspended = renderHook(
                        () => {
                            try {
                                const prefetched = useNormalizedPrefetchInfiniteQuery(
                                    infiniteAuthorsWithBooks,
                                    undefined
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

                    infiniteBooksByAuthor.setInfiniteQueryData(
                        client,
                        {
                            authorId: tolkienId,
                        },
                        {
                            pages: [
                                [
                                    {
                                        bookId: longWalkId,
                                    },
                                ],
                            ],
                            pageParams: [{ offset: -1 }],
                        }
                    );

                    const [preload] = await Promise.all([
                        infiniteAuthorsWithBooks.prefetchInfiniteQuery(client),
                        prom as Promise<void>,
                    ]);

                    let { result } = renderHook(() => useHook(preload), { wrapper });

                    expect(
                        result.current.listedAuthors.map(author => author.getParams().authorId),
                        'to contain',
                        tolkienId
                    );
                    expect(result.current.listedBooks, 'to contain', longWalkId);

                    // Wait for existing subqueries to flush...
                    await Promise.all(
                        client
                            .getQueryCache()
                            .findAll()
                            .map(async x => x.promise)
                    );

                    ({ result } = renderHook(() => useHook(preload), { wrapper }));

                    expect(result.current.listedBooks, 'not to contain', fellowshipOfTheRingId);
                    expect(authors.hasData(client, { authorId: tolkienId }), 'to be true');
                    // Got loaded via propagation of initial data
                    expect(authors.hasState(client, { authorId: kingId }), 'to be true');
                }
            );
        });

        suite('useNormalizedNullablePrefetchedSuspenseInfiniteQuery', () => {
            const useHook = (prefetched: LinkOf<typeof infiniteAuthorsWithBooks>) => {
                const listedAuthors =
                    useNormalizedNullablePrefetchedSuspenseInfiniteQuery(prefetched);

                const listedBooks = useNormalizedNullablePrefetchedSuspenseInfiniteQuery(
                    listedAuthors?.data.pages[0]?.[0] ?? skipToken,
                    {
                        select: data => data.pages.flat().map(book => book.getParams().bookId),
                    }
                );

                return {
                    listedAuthors,
                    listedBooks,
                };
            };

            contextWithWrapper.test(
                'Suspends before data is loaded',
                async ({ client, wrapper }) => {
                    let prom: unknown;
                    let suspended = renderHook(
                        () => {
                            try {
                                const prefetched = useNormalizedPrefetchInfiniteQuery(
                                    infiniteAuthorsWithBooks,
                                    undefined
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

                    const [preload] = await Promise.all([
                        infiniteAuthorsWithBooks.prefetchInfiniteQuery(client),
                        prom as Promise<void>,
                    ]);

                    suspended = renderHook(
                        () => {
                            try {
                                return useHook(preload);
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

                    const { result } = renderHook(() => useHook(preload), { wrapper });

                    expect(result.current.listedAuthors?.hasNextPage, 'to equal', true);
                    expect(
                        result.current.listedAuthors?.data.pages
                            .flat()
                            .map(author => author.getParams().authorId),
                        'to contain',
                        tolkienId
                    );
                    expect(result.current.listedBooks?.data, 'to contain', fellowshipOfTheRingId);
                }
            );

            contextWithWrapper.test('Allows skipping queries', async ({ client, wrapper }) => {
                infiniteAuthorsWithBooks.populate(client, undefined, {
                    pages: [[]],
                    pageParams: [{ offset: -1 }],
                });

                await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client);

                const { result } = renderHook(
                    () => {
                        const prefetched = useNormalizedPrefetchInfiniteQuery(
                            infiniteAuthorsWithBooks,
                            undefined
                        );
                        return useHook(prefetched);
                    },
                    { wrapper }
                );

                expect(result.current.listedAuthors?.data.pages.flat(), 'to have length', 0);
                expect(result.current.listedBooks, 'to be null');
            });
        });
    });
});
