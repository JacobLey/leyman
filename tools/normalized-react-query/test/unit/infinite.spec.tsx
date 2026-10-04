import { QueryClient, skipToken, useQueries, useQueryClient } from '@tanstack/react-query';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import {
    infinite,
    useNormalizedInfiniteQuery,
    useNormalizedNullablePrefetchedSuspenseInfiniteQuery,
    useNormalizedNullableSuspenseInfiniteQuery,
    useNormalizedPrefetchedInfiniteQuery,
    useNormalizedPrefetchedSuspenseInfiniteQuery,
    useNormalizedPrefetchInfiniteQuery,
    useNormalizedSuspenseInfiniteQuery,
} from 'normalized-react-query';
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
import { createWrapper, renderHook, waitFor } from '../data/render.js';

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

            const authorWithBook = await authorsWithBooks.infiniteQuery(client);

            expect(authorWithBook.pages.flat()).to.have.length(2);
            const [firstLink] = authorWithBook.pages.flat();
            expect(firstLink!.getQueryClient()).to.equal(client);
            expect(firstLink!.getQueryable()).to.equal(infiniteBooksByAuthor);
            expect(firstLink!.getParams()).to.deep.equal({ authorId: tolkienId });

            await firstLink!
                .getQueryable()
                .getCachedQuery(firstLink!.getQueryClient(), firstLink!.getParams())!.promise;

            const tolkiensBooks = firstLink!
                .getQueryable()
                .getInfiniteQueryData(firstLink!.getQueryClient(), firstLink!.getParams())
                ?.pages.flat()
                .map(book => book.bookId);
            expect(tolkiensBooks).to.have.length(2);
            expect(tolkiensBooks).to.include(fellowshipOfTheRingId);
        });

        context.test('Cannot be invoked directly', async () => {
            expect(() => infiniteBooksWithAuthor.link({ authorId: tolkienId })).to.throw();
        });
    });

    suite('get/setInfiniteQueryData', () => {
        context.test('Set direct data', async ({ client }) => {
            const authorId = '<author-id>';
            const bookId = '<book-id>';

            expect(infiniteAuthorsWithBooks.getQueryState(client)).to.equal(undefined);
            expect(infiniteBooksWithAuthor.getQueryState(client, { authorId })).to.equal(undefined);

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
            expect(listedAuthors?.data?.pages[0]?.[0]?.authorId).to.equal(authorId);
            const listedBooks = infiniteBooksWithAuthor.getQueryState(client, { authorId });
            expect(listedBooks?.data?.pages[0]?.[0]?.bookId).to.equal(bookId);

            const fetchedData = await infiniteAuthorsWithBooks.infiniteQuery(client);
            expect(
                fetchedData.pages.flat().map(author => author.getParams().authorId)
            ).to.deep.equal([authorId]);

            expect(infiniteBooksWithAuthor.getQueryData(new QueryClient(), { authorId })).to.equal(
                undefined
            );
        });

        context.test('Set populated data', async ({ client }) => {
            const authorId = '<author-id>';
            const bookId = '<book-id>';

            expect(infiniteAuthorsWithBooks.getQueryState(client)).to.equal(undefined);
            expect(infiniteBooksWithAuthor.getQueryState(client, { authorId })).to.equal(undefined);

            expect(
                // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
                infiniteAuthorsWithBooks.populate(client, undefined, {
                    pages: [[{ authorId }]],
                    pageParams: [
                        {
                            offset: -1,
                        },
                    ],
                })
            ).to.equal(undefined);
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
                )
            ).to.deep.equal({ authorId });

            const listedAuthors = infiniteAuthorsWithBooks.getQueryState(client);
            expect(listedAuthors?.data?.pages[0]?.[0]?.authorId).to.equal(authorId);
            const listedBooks = infiniteBooksWithAuthor.getQueryState(client, { authorId });
            expect(listedBooks?.data?.pages[0]?.[0]?.bookId).to.equal(bookId);
        });
    });

    suite('infiniteQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const listedBooks = await infiniteBooksWithAuthor.infiniteQuery(
                client,
                { authorId: tolkienId },
                { pages: 10 }
            );

            expect(listedBooks.pages).to.have.length(3);
            expect(listedBooks.pages.flat().map(book => book.getParams().bookId)).to.include(
                fellowshipOfTheRingId
            );
        });

        context.test('Selects from propagated data', async ({ client }) => {
            const bookIds = await infiniteBooksWithAuthor.infiniteQuery(
                client,
                { authorId: tolkienId },
                {
                    pages: 10,
                    select: data => data.pages.flat().map(book => book.getParams().bookId),
                }
            );

            expect(bookIds).to.include(fellowshipOfTheRingId);
            expect(
                infiniteBooksWithAuthor.getQueryData(client, { authorId: tolkienId })?.pages
            ).to.have.length(3);
        });

        context.test('Waits for links', async ({ client }) => {
            await infiniteBooksWithAuthor.infiniteQuery(
                client,
                { authorId: tolkienId },
                { awaitLinks: true }
            );

            expect(books.isFetching(client, { bookId: fellowshipOfTheRingId })).to.equal(false);
            expect(
                booksWithAuthor.getQueryData(client, { bookId: fellowshipOfTheRingId })?.title
            ).to.equal('Fellowship of the Ring');
        });

        context.test('Throws when awaited link throws', async ({ client }) => {
            const authorWithFakeFavoriteBook = infiniteBooksByAuthor.propagate(({ page }) =>
                page.map(book => authors.link({ authorId: book.bookId }))
            );

            await expect(
                authorWithFakeFavoriteBook.infiniteQuery(
                    client,
                    { authorId: tolkienId },
                    { awaitLinks: true }
                )
            ).to.be.rejected;
        });
    });

    /* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- Tests the deprecated methods until they are removed */
    suite('fetchInfiniteQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const listedAuthors = await infiniteAuthorsWithBooks.fetchInfiniteQuery(client);

            const authorId = listedAuthors.pages
                .flat()
                .map(author => author.getParams().authorId)[0]!;
            expect(authorId).to.equal(tolkienId);

            const listedBooks = await infiniteBooksWithAuthor.fetchInfiniteQuery(
                client,
                {
                    authorId,
                },
                {
                    pages: 10,
                }
            );

            expect(listedBooks.pages).to.have.length(3);
            const bookIds = listedBooks.pages.flat().map(book => book.getParams().bookId);

            expect(bookIds).to.include(fellowshipOfTheRingId);
        });

        context.test('Throws when query throws', async ({ client }) => {
            await expect(
                infiniteBooksWithAuthor.fetchInfiniteQuery(client, { authorId: '<not-a-real-id>' })
            ).to.be.rejected;
        });

        context.test('Does not throw when propagated throws', async ({ client }) => {
            const authorWithFakeFavoriteBook = infiniteBooksByAuthor.propagate(({ page }) =>
                page.map(book => authors.link({ authorId: book.bookId }))
            );

            await expect(
                authorWithFakeFavoriteBook.fetchInfiniteQuery(client, { authorId: tolkienId })
            ).to.be.fulfilled;
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

            expect(infiniteBooksWithAuthor.isFetching(client, { authorId: tolkienId })).to.equal(
                true
            );
        });
    });
    /* eslint-enable @typescript-eslint/no-deprecated, sonarjs/deprecation */

    suite('prefetchQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const linkedBooks = await infiniteBooksWithAuthor.prefetchInfiniteQuery(client, {
                authorId: tolkienId,
            });

            const listedBooks = infiniteBooksWithAuthor.getQueryData(
                client,
                linkedBooks.getParams()
            );
            expect(listedBooks?.pages.flat().map(book => book.bookId)).to.include(
                fellowshipOfTheRingId
            );
        });

        context.test('Get populated data', async ({ client }) => {
            await infiniteBooksWithAuthor.prefetchInfiniteQuery(client, { authorId: kingId });

            expect(books.hasState(client, { bookId: longWalkId })).to.equal(false);

            await infiniteBooksWithAuthor.prefetchInfiniteQuery(
                client,
                { authorId: kingId },
                {
                    // Ignored second time around
                    pages: 10,
                }
            );

            expect(books.hasState(client, { bookId: longWalkId })).to.equal(false);
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
            expect(book?.title).to.equal('The Long Walk');
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
            expect(infiniteBooksByAuthor.isFetching(client, { authorId: kingId })).to.equal(true);
        });
    });

    /* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- Tests the deprecated methods until they are removed */
    suite('ensureQueryData', () => {
        context.test('Waits for propagated data every time', async ({ client }) => {
            const authorId = tolkienId;
            await infiniteBooksWithAuthor.ensureInfiniteQueryData(client, { authorId });
            booksWithAuthor.removeQuery(client, { bookId: fellowshipOfTheRingId });

            await infiniteBooksWithAuthor.ensureInfiniteQueryData(client, { authorId });
            expect(
                booksWithAuthor.getQueryData(client, { bookId: fellowshipOfTheRingId })?.title
            ).to.equal('Fellowship of the Ring');
        });

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

            expect(authors.getQueryData(client, { authorId })?.name).to.equal('Stephen King');
            expect(authors.getQueryData(client, { authorId: tolkienId })).to.equal(undefined);
            expect(books.getQueryData(client, { bookId })?.title).to.equal('The Long Walk');
            expect(books.getQueryData(client, { bookId: shiningId })).to.equal(undefined);
        });

        context.test('Get populated data', async ({ client }) => {
            await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client);

            expect(
                infiniteBooksByAuthor
                    .getQueryData(client, {
                        authorId: tolkienId,
                    })
                    ?.pages.flat()
            ).to.have.length(4);
            expect(
                books.getQueryData(client, {
                    bookId: fellowshipOfTheRingId,
                })?.title
            ).to.equal('Fellowship of the Ring');

            expect(books.getQueryData(client, { bookId: longWalkId })).to.equal(undefined);

            await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client, undefined, {
                // Not respected after initial load
                pages: 10,
            });
            expect(books.hasState(client, { bookId: longWalkId })).to.equal(false);
        });

        context.test('Only respects options on initial load', async ({ client }) => {
            await infiniteAuthorsWithBooks.ensureInfiniteQueryData(client, undefined, {
                pages: 10,
            });

            expect(books.getQueryData(client, { bookId: longWalkId })?.title).to.equal(
                'The Long Walk'
            );
        });

        context.test('Throws when failure', async ({ client }) => {
            await expect(
                infiniteBooksByAuthor.ensureInfiniteQueryData(client, { authorId: '<author-id>' })
            ).to.be.rejected;
        });

        context.test('Throws when propagated failure', async ({ client }) => {
            const infiniteBooksWithMoreBooks = infiniteBooksWithAuthor.propagate(({ page }) =>
                page.map(book => ({
                    book,
                    otherBooksInSeries: infiniteBooksByAuthor.link({ authorId: '<author-id>' }),
                }))
            );

            await expect(
                infiniteBooksWithMoreBooks.ensureInfiniteQueryData(client, { authorId: austenId })
            ).to.be.rejected;
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

                await expect(
                    infiniteBooksWithMoreBooks.ensureInfiniteQueryData(client, {
                        authorId: austenId,
                    })
                ).to.be.fulfilled;
            }
        );
    });
    /* eslint-enable @typescript-eslint/no-deprecated, sonarjs/deprecation */

    /* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- Tests the deprecated methods until they are removed */
    suite('revalidateIfStale', () => {
        const withCounted = context.beforeEach(() => {
            const counter = { calls: 0 };
            const counted = infinite<void, number, number>({
                key: ['counted'],
                getInitialPageParam: 0,
                getNextPageParam: () => null,
                queryFn: async () => {
                    counter.calls++;
                    return counter.calls;
                },
            });
            return { counted, counter };
        });

        withCounted.test(
            'Refetches stale cached data in the background',
            async ({ client, counted, counter }) => {
                counted.setInfiniteQueryData(client, undefined, { pages: [0], pageParams: [0] });

                const data = await counted.ensureInfiniteQueryData(client, undefined, {
                    revalidateIfStale: true,
                    staleTime: 0,
                });
                expect(data.pages).to.deep.equal([0]);

                await counted.getCachedQuery(client, undefined)!.promise;
                expect(counter.calls).to.equal(1);
                expect(counted.getInfiniteQueryData(client, undefined)?.pages).to.deep.equal([1]);
            }
        );

        withCounted.test('Fetches uncached data once', async ({ client, counted, counter }) => {
            const data = await counted.ensureInfiniteQueryData(client, undefined, {
                revalidateIfStale: true,
                staleTime: 0,
            });
            expect(data.pages).to.deep.equal([1]);
            expect(client.isFetching()).to.equal(0);
            expect(counter.calls).to.equal(1);
        });
    });
    /* eslint-enable @typescript-eslint/no-deprecated, sonarjs/deprecation */

    suite('hooks', () => {
        const contextWithWrapper = context.beforeEach(({ client }) => ({
            wrapper: createWrapper(client),
        }));

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

            contextWithWrapper.test('Renders data once loaded', async ({ wrapper }) => {
                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current).to.deep.equal({
                    firstAuthor: undefined,
                    firstAuthorBookIds: [],
                    lastAuthor: undefined,
                    lastAuthorBookParams: undefined,
                    lastAuthorBookIds: [],
                    hasMoreAuthors: false,
                    hasPreviousAuthors: false,
                    fetchMoreAuthors: result.current.fetchMoreAuthors,
                });

                await waitFor(() => {
                    expect(result.current.firstAuthorBookIds).to.include(fellowshipOfTheRingId);
                });
                expect(result.current.firstAuthor).to.deep.equal({ authorId: tolkienId });
                expect(result.current.lastAuthor).to.deep.equal({ authorId: orwellId });
                expect(result.current.hasMoreAuthors).to.equal(true);
            });

            contextWithWrapper.test('Returns data when preloaded', async ({ client, wrapper }) => {
                await infiniteAuthorsWithBooks.infiniteQuery(client, undefined, {
                    staleTime: 'static',
                    awaitLinks: true,
                });

                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current.firstAuthor).to.deep.equal({ authorId: tolkienId });
                expect(result.current.firstAuthorBookIds).to.include(fellowshipOfTheRingId);
                expect(result.current.lastAuthor).to.deep.equal({ authorId: orwellId });
                expect(result.current.lastAuthorBookParams).to.deep.equal([0, 2]);
                expect(result.current.hasMoreAuthors).to.equal(true);
                expect(result.current.hasPreviousAuthors).to.equal(false);

                await result.current.fetchMoreAuthors();

                await waitFor(() => {
                    expect(result.current.lastAuthor).to.deep.equal({ authorId: kingId });
                });
                expect(result.current.firstAuthor).to.deep.equal({ authorId: tolkienId });
                expect(result.current.firstAuthorBookIds).to.include(fellowshipOfTheRingId);
                expect(result.current.hasMoreAuthors).to.equal(true);
                expect(result.current.hasPreviousAuthors).to.equal(false);

                await waitFor(() => {
                    expect(result.current.lastAuthorBookIds).to.include(shiningId);
                });

                await result.current.fetchMoreAuthors();

                await waitFor(() => {
                    expect(result.current.hasMoreAuthors).to.equal(false);
                });
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

                    expect(result.current.skipped.data).to.equal(undefined);
                    expect(
                        result.current.initialized.data?.pages
                            .flat()
                            .map(book => book.getParams().bookId)
                    ).to.deep.equal(['<book-id-2>']);
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

            contextWithWrapper.test('Renders data once loaded', async ({ wrapper }) => {
                const { result } = renderHook(() => useHook({ pages: 1 }), {
                    wrapper,
                });

                expect(result.current).to.deep.equal({
                    listedAuthors: null,
                    listedBooks: null,
                });

                await waitFor(() => {
                    expect(result.current.listedBooks).to.include(fellowshipOfTheRingId);
                });
                expect(result.current.listedAuthors).to.include(tolkienId);
                expect(result.current.listedAuthors).to.not.include(kingId);
            });

            contextWithWrapper.test('Allows returning empty', async ({ client, wrapper }) => {
                const { result, rerender } = renderHook(useHook, {
                    initialProps: { pages: 0 },
                    wrapper,
                });

                expect(result.current).to.deep.equal({
                    listedAuthors: null,
                    listedBooks: null,
                });

                await infiniteAuthors.infiniteQuery(client, undefined, {
                    staleTime: 'static',
                    awaitLinks: true,
                    pages: 2,
                });

                await waitFor(() => {
                    expect(result.current.listedAuthors).to.include(tolkienId);
                });
                expect(result.current.listedAuthors).to.not.include(kingId);

                rerender({ pages: 2 });

                expect(result.current.listedAuthors).to.not.include(kingId);
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
                    const { result } = renderHook(() => useHook(), { wrapper });

                    expect(result.current).to.equal(null);
                    expect(infiniteAuthors.getQueryState(client)?.fetchStatus).to.equal('fetching');
                    expect(
                        infiniteBooksByAuthor.getQueryState(client, { authorId: tolkienId })
                    ).to.equal(undefined);

                    await waitFor(() => {
                        expect(result.current).to.not.equal(null);
                    });
                    expect(result.current.firstAuthor).to.deep.equal({ authorId: tolkienId });
                    expect(result.current.listedBooks).to.include(fellowshipOfTheRingId);
                    expect(result.current.hasMoreAuthors).to.equal(true);

                    await result.current.loadMoreAuthors();

                    // Does not suspend again while loading more
                    expect(result.current.firstAuthor).to.deep.equal({ authorId: tolkienId });
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
                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current).to.equal(null);

                await waitFor(() => {
                    expect(result.current).to.not.equal(null);
                });
                expect(result.current.skipped).to.equal(null);
                expect(result.current.listedBooks).to.not.equal(undefined);
                expect(result.current.listedBooks).to.not.include(longWalkId);

                await infiniteBooksByAuthor.prefetchInfiniteQuery(
                    client,
                    { authorId: kingId },
                    {
                        pages: 5,
                    }
                );

                // Prefetching existing data does not load more pages
                expect(result.current.listedBooks).to.not.include(longWalkId);

                // Mark stale without refetching, so the prefetch loads every page
                await infiniteBooksByAuthor.invalidateQuery(
                    client,
                    { authorId: kingId },
                    { refetchType: 'none' }
                );
                await infiniteBooksByAuthor.prefetchInfiniteQuery(
                    client,
                    { authorId: kingId },
                    {
                        pages: 5,
                    }
                );

                await waitFor(() => {
                    expect(result.current.listedBooks).to.include(longWalkId);
                });
            });
        });

        suite('useNormalizedPrefetchedSuspenseInfiniteQuery', () => {
            const useHook = () => {
                const prefetched = useNormalizedPrefetchInfiniteQuery(
                    infiniteAuthorsWithBooks,
                    undefined
                );

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
                    const { result } = renderHook(() => useHook(), { wrapper });

                    expect(result.current).to.equal(null);

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

                    await waitFor(() => {
                        expect(result.current).to.not.equal(null);
                    });
                    expect(
                        result.current.listedAuthors.map(author => author.getParams().authorId)
                    ).to.include(tolkienId);
                    expect(result.current.listedBooks).to.include(longWalkId);

                    // Wait for existing subqueries to flush...
                    await Promise.all(
                        client
                            .getQueryCache()
                            .findAll()
                            .map(async x => x.promise)
                    );

                    expect(result.current.listedBooks).to.not.include(fellowshipOfTheRingId);
                    expect(authors.hasData(client, { authorId: tolkienId })).to.equal(true);
                    // Got loaded via propagation of initial data
                    expect(authors.hasState(client, { authorId: kingId })).to.equal(true);
                }
            );
        });

        suite('useNormalizedNullablePrefetchedSuspenseInfiniteQuery', () => {
            const useHook = () => {
                const prefetched = useNormalizedPrefetchInfiniteQuery(
                    infiniteAuthorsWithBooks,
                    undefined
                );

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

            contextWithWrapper.test('Suspends before data is loaded', async ({ wrapper }) => {
                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current).to.equal(null);

                await waitFor(() => {
                    expect(result.current).to.not.equal(null);
                });
                expect(result.current.listedAuthors?.hasNextPage).to.equal(true);
                expect(
                    result.current.listedAuthors?.data.pages
                        .flat()
                        .map(author => author.getParams().authorId)
                ).to.include(tolkienId);
                expect(result.current.listedBooks?.data).to.include(fellowshipOfTheRingId);
            });

            contextWithWrapper.test('Allows skipping queries', async ({ client, wrapper }) => {
                infiniteAuthorsWithBooks.populate(client, undefined, {
                    pages: [[]],
                    pageParams: [{ offset: -1 }],
                });

                await infiniteAuthorsWithBooks.infiniteQuery(client, undefined, {
                    staleTime: 'static',
                    awaitLinks: true,
                });

                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current.listedAuthors?.data.pages.flat()).to.have.length(0);
                expect(result.current.listedBooks).to.equal(null);
            });
        });
    });
});
