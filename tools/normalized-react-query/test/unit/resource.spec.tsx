import type { SkipToken } from '@tanstack/react-query';
import {
    QueryClient,
    skipToken,
    useQueries,
    useQueryClient,
    useSuspenseQueries,
} from '@tanstack/react-query';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import {
    resource,
    useNormalizedNullablePrefetchedSuspenseQuery,
    useNormalizedNullableSuspenseQuery,
    useNormalizedPrefetchedQuery,
    useNormalizedPrefetchedSuspenseQuery,
    useNormalizedPrefetchQuery,
    useNormalizedQuery,
    useNormalizedSuspenseQuery,
} from 'normalized-react-query';
import { austenId, fellowshipOfTheRingId, prideAndPrejudiceId, tolkienId } from '../data/api.js';
import { authors, books } from '../data/normalized.js';
import { createWrapper, renderHook, waitFor } from '../data/render.js';
import { Linked } from '#internal/lib/linked.js';

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

            const tolkien = await recursiveAuthor.query(client, {
                authorId: tolkienId,
            });

            expect(tolkien).to.be.an.instanceOf(Linked);
            expect(tolkien.getQueryClient()).to.equal(client);
            expect(tolkien.getQueryable()).to.equal(authorsWithFavoriteAuthor);
            expect(tolkien.getParams()).to.deep.equal({ authorId: tolkienId });

            await tolkien
                .getQueryable()
                .getCachedQuery(tolkien.getQueryClient(), tolkien.getParams())!.promise;

            const tolkiensFavorite = tolkien
                .getQueryable()
                .getQueryData(tolkien.getQueryClient(), tolkien.getParams());
            expect(tolkiensFavorite?.favoriteAuthor).to.deep.equal({
                authorId: austenId,
            });
        });

        context.test('Cannot be invoked directly', async () => {
            expect(() => authors.link({ authorId: tolkienId })).to.throw();
        });
    });

    suite('get/setQueryData', () => {
        context.test('Set direct data', async ({ client }) => {
            const randomId = '<random-id>';
            const params = { authorId: randomId };
            const name = 'Joe Schmoe';

            expect(authors.getQueryState(client, params)).to.equal(undefined);

            authors.setQueryData(client, params, {
                name,
                id: randomId,
                favoriteAuthor: null,
            });

            const data = authors.getQueryData(client, params);
            expect(data).to.not.equal(undefined);
            expect(data!.name).to.equal(name);

            const fetchedData = await authors.query(client, params);
            expect(fetchedData.name).to.equal(name);

            expect(authors.getQueryData(new QueryClient(), params)).to.equal(undefined);
        });

        context.test('Set populated data', async ({ client }) => {
            const authorId = '<author-id>';
            const authorParams = { authorId };
            const bookId = '<book-id>';
            const bookParams = { bookId };

            expect(authors.getQueryState(client, authorParams)).to.equal(undefined);
            expect(books.getQueryState(client, bookParams)).to.equal(undefined);

            expect(
                books.populate(client, bookParams, {
                    id: bookId,
                    title: '<title>',
                    author: authors.populate(client, authorParams, {
                        id: authorId,
                        name: '<name>',
                        favoriteAuthor: null,
                    }),
                })
            ).to.equal(bookParams);

            const book = books.getQueryData(client, bookParams);
            expect(book).to.not.equal(undefined);
            expect(book!.author).to.equal(authorParams);

            const author = authors.getQueryData(client, authorParams);
            expect(author).to.not.equal(undefined);
            expect(author!.name).to.equal('<name>');
        });
    });

    suite('query', () => {
        context.test('Get direct data', async ({ client }) => {
            const author = await authors.query(client, { authorId: tolkienId });

            expect(author.name).to.equal('J.R.R. Tolkien');
            expect(authors.getQueryData(client, { authorId: tolkienId })).to.equal(author);
        });

        context.test('Selects from propagated data', async ({ client }) => {
            const name = await authorsWithFavoriteAuthor.query(
                client,
                { authorId: tolkienId },
                { select: author => author.favoriteAuthor?.getParams().authorId }
            );

            expect(name).to.equal(austenId);
            expect(authors.getQueryData(client, { authorId: tolkienId })?.name).to.equal(
                'J.R.R. Tolkien'
            );
        });

        context.test('Loads links in the background', async ({ client }) => {
            await authorsWithFavoriteAuthor.query(client, { authorId: tolkienId });

            expect(authors.isFetching(client, { authorId: austenId })).to.equal(true);
        });

        context.test('Waits for links', async ({ client }) => {
            await authorsWithFavoriteAuthor.query(
                client,
                { authorId: tolkienId },
                { awaitLinks: true }
            );

            expect(authors.isFetching(client, { authorId: austenId })).to.equal(false);
            expect(authors.getQueryData(client, { authorId: austenId })?.name).to.equal(
                'Jane Austen'
            );
        });

        context.test('Throws when awaited link throws', async ({ client }) => {
            const authorWithFakeFavoriteBook = authors.propagate(author => ({
                ...author,
                favoriteBook: books.link({ bookId: '<fake-book-id>' }),
            }));

            await expect(authorWithFakeFavoriteBook.query(client, { authorId: tolkienId })).to.be
                .fulfilled;
            await expect(
                authorWithFakeFavoriteBook.query(
                    client,
                    { authorId: tolkienId },
                    { awaitLinks: true }
                )
            ).to.be.rejected;
        });

        context.test('Returns cached data when static', async ({ client }) => {
            const bookId = '<book-id>';
            books.setQueryData(
                client,
                { bookId },
                { id: bookId, title: '<title>', author: { authorId: tolkienId } }
            );

            const book = await books.query(client, { bookId }, { staleTime: 'static' });
            expect(book.title).to.equal('<title>');
        });
    });

    /* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- Tests the deprecated methods until they are removed */
    suite('fetchQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const author = await authors.fetchQuery(client, { authorId: tolkienId });

            expect(author.name).to.equal('J.R.R. Tolkien');
            expect(authors.getQueryData(client, { authorId: tolkienId })).to.equal(author);
        });

        context.test('Get populated data', async ({ client }) => {
            const bookParams = { bookId: fellowshipOfTheRingId };

            const fetchBook = books.fetchQuery(client, bookParams);
            expect(books.isFetching(client, bookParams)).to.equal(true);
            expect(books.hasState(client, bookParams)).to.equal(true);
            expect(books.hasData(client, bookParams)).to.equal(false);
            expect(books.getQueryState(client, bookParams)).to.not.equal(undefined);
            const book = await fetchBook;

            expect(book.title).to.equal('Fellowship of the Ring');

            const fetchAuthor = authors.fetchQuery(client, book.author);
            expect(books.isFetching(client, { bookId: fellowshipOfTheRingId })).to.equal(false);
            expect(books.hasData(client, bookParams)).to.equal(true);
            expect(books.getQueryState(client, bookParams)).to.not.equal(undefined);
            const author = await fetchAuthor;

            expect(author.name).to.equal('J.R.R. Tolkien');
        });

        context.test('Throws when query throws', async ({ client }) => {
            await expect(books.fetchQuery(client, { bookId: '<not-a-real-id>' })).to.be.rejected;
        });

        context.test('Does not throw when propagated throws', async ({ client }) => {
            const authorWithFakeFavoriteBook = authors.propagate(author => ({
                ...author,
                favoriteBook: books.link({ bookId: '<fake-book-id>' }),
            }));

            await expect(authorWithFakeFavoriteBook.fetchQuery(client, { authorId: tolkienId })).to
                .be.fulfilled;
        });

        context.test('Triggers downstream propagation', async ({ client }) => {
            await authorsWithFavoriteAuthor.fetchQuery(client, {
                authorId: tolkienId,
            });

            expect(authors.isFetching(client, { authorId: austenId })).to.equal(true);
        });
    });
    /* eslint-enable @typescript-eslint/no-deprecated, sonarjs/deprecation */

    suite('prefetchQuery', () => {
        context.test('Get direct data', async ({ client }) => {
            const linkedAuthor = await authors.prefetchQuery(client, { authorId: tolkienId });

            const author = authors.getQueryData(client, linkedAuthor.getParams());
            expect(author).to.not.equal(undefined);
            expect(author!.name).to.equal('J.R.R. Tolkien');
        });

        context.test('Get populated data', async ({ client }) => {
            const linkedBook = await books.prefetchQuery(client, { bookId: fellowshipOfTheRingId });

            const book = books.getQueryData(client, linkedBook.getParams());
            expect(book).to.not.equal(undefined);
            expect(book!.title).to.equal('Fellowship of the Ring');

            const author = authors.getQueryData(client, book!.author);
            expect(author).to.not.equal(undefined);
            expect(author!.name).to.equal('J.R.R. Tolkien');
        });

        context.test('Does not propagate failure', async ({ client }) => {
            await books.prefetchQuery(client, { bookId: '<not-a-real-id>' });
        });

        context.test('Triggers downstream propagation', async ({ client }) => {
            await authorsWithFavoriteAuthor.prefetchQuery(client, {
                authorId: tolkienId,
            });

            expect(authors.isFetching(client, { authorId: austenId })).to.equal(true);
        });
    });

    /* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- Tests the deprecated methods until they are removed */
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
            expect(book.title).to.equal('<title>');

            await expect(authors.ensureQueryData(client, book.author)).to.be.rejected;
        });

        context.test('Get populated data', async ({ client }) => {
            await books.ensureQueryData(client, {
                bookId: fellowshipOfTheRingId,
            });

            const book = books.getQueryData(client, {
                bookId: fellowshipOfTheRingId,
            });
            expect(book).to.not.equal(undefined);
            expect(book!.title).to.equal('Fellowship of the Ring');

            const author = authors.getQueryData(client, book!.author);
            expect(author).to.not.equal(undefined);
            expect(author!.name).to.equal('J.R.R. Tolkien');
        });

        context.test('Get propagated data', async ({ client }) => {
            await authorsWithFavoriteAuthor.ensureQueryData(client, {
                authorId: tolkienId,
            });

            const author = authorsWithFavoriteAuthor.getQueryData(client, { authorId: austenId });
            expect(author).to.not.equal(undefined);
            expect(author!.name).to.equal('Jane Austen');
        });

        context.test('Waits for propagated data every time', async ({ client }) => {
            await authorsWithFavoriteAuthor.ensureQueryData(client, { authorId: tolkienId });
            authorsWithFavoriteAuthor.removeQuery(client, { authorId: austenId });

            await authorsWithFavoriteAuthor.ensureQueryData(client, { authorId: tolkienId });
            expect(
                authorsWithFavoriteAuthor.getQueryData(client, { authorId: austenId })?.name
            ).to.equal('Jane Austen');
        });

        context.test('Throws when failure', async ({ client }) => {
            await expect(books.ensureQueryData(client, { bookId: '<book-id>' })).to.be.rejected;
        });

        context.test('Throws when propagated failure', async ({ client }) => {
            const authorWithFavoriteFakeBook = authors.propagate(author => ({
                ...author,
                favoriteBook: books.link({ bookId: '<book-id>' }),
            }));

            await expect(
                authorWithFavoriteFakeBook.ensureQueryData(client, { authorId: tolkienId })
            ).to.be.rejected;
        });

        context.test(
            'Does not throw when propagated failure isolates errors',
            async ({ client }) => {
                const authorWithFavoriteIsolatedFakeBook = authors.propagate(author => ({
                    ...author,
                    favoriteBook: books.link({ bookId: '<book-id>' }, { isolateErrors: true }),
                }));

                await expect(
                    authorWithFavoriteIsolatedFakeBook.ensureQueryData(client, {
                        authorId: tolkienId,
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
            const counted = resource<void, number>({
                key: ['counted'],
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
                counted.setQueryData(client, undefined, 0);

                const data = await counted.ensureQueryData(client, undefined, {
                    revalidateIfStale: true,
                    staleTime: 0,
                });
                expect(data).to.equal(0);

                await counted.getCachedQuery(client, undefined)!.promise;
                expect(counter.calls).to.equal(1);
                expect(counted.getQueryData(client, undefined)).to.equal(1);
            }
        );

        withCounted.test(
            'Does not refetch unless requested',
            async ({ client, counted, counter }) => {
                counted.setQueryData(client, undefined, 0);

                const data = await counted.ensureQueryData(client, undefined, { staleTime: 0 });
                expect(data).to.equal(0);
                expect(client.isFetching()).to.equal(0);
                expect(counter.calls).to.equal(0);
            }
        );

        withCounted.test('Does not refetch fresh data', async ({ client, counted, counter }) => {
            counted.setQueryData(client, undefined, 0);

            const data = await counted.ensureQueryData(client, undefined, {
                revalidateIfStale: true,
            });
            expect(data).to.equal(0);
            expect(client.isFetching()).to.equal(0);
            expect(counter.calls).to.equal(0);
        });

        withCounted.test('Fetches uncached data once', async ({ client, counted, counter }) => {
            const data = await counted.ensureQueryData(client, undefined, {
                revalidateIfStale: true,
                staleTime: 0,
            });
            expect(data).to.equal(1);
            expect(client.isFetching()).to.equal(0);
            expect(counter.calls).to.equal(1);
        });
    });
    /* eslint-enable @typescript-eslint/no-deprecated, sonarjs/deprecation */

    suite('hooks', () => {
        const contextWithWrapper = context.beforeEach(({ client }) => ({
            wrapper: createWrapper(client),
        }));

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

            contextWithWrapper.test('Renders data once loaded', async ({ wrapper }) => {
                const { result } = renderHook(() => useHook({ bookId: fellowshipOfTheRingId }), {
                    wrapper,
                });

                expect(result.current.book.data).to.equal(undefined);
                expect(result.current.author.data?.id).to.equal(undefined);
                expect(result.current.favoriteAuthor.data).to.equal(undefined);

                // Favorite author is already linked by the time it renders, so initial data is not used
                await waitFor(() => {
                    expect(result.current.favoriteAuthor.data?.id).to.equal(austenId);
                });
                expect(result.current.book.data?.id).to.equal(fellowshipOfTheRingId);
                expect(result.current.author.data?.id).to.equal(tolkienId);
            });

            contextWithWrapper.test('Returns data when preloaded', async ({ client, wrapper }) => {
                await Promise.all([
                    bookWithAuthorsFavorite.query(
                        client,
                        {
                            bookId: fellowshipOfTheRingId,
                        },
                        { staleTime: 'static', awaitLinks: true }
                    ),
                    bookWithAuthorsFavorite.query(
                        client,
                        {
                            bookId: prideAndPrejudiceId,
                        },
                        { staleTime: 'static', awaitLinks: true }
                    ),
                ]);

                const { result, rerender } = renderHook(useHook, {
                    initialProps: { bookId: fellowshipOfTheRingId },
                    wrapper,
                });

                expect(result.current.book.data?.id).to.equal(fellowshipOfTheRingId);
                expect(result.current.author.data?.id).to.equal(tolkienId);
                expect(result.current.favoriteAuthor.data?.id).to.equal(austenId);

                rerender({ bookId: prideAndPrejudiceId });

                expect(result.current.book.data?.id).to.equal(prideAndPrejudiceId);
                expect(result.current.author.data?.id).to.equal(austenId);
                expect(result.current.favoriteAuthor.data).to.equal(undefined);
            });

            contextWithWrapper.test(
                'Respects initial data only when valid params',
                async ({ client, wrapper }) => {
                    await bookWithAuthorsFavorite.prefetchQuery(client, {
                        bookId: fellowshipOfTheRingId,
                    });

                    const { result, rerender } = renderHook(useHook, {
                        initialProps: { bookId: fellowshipOfTheRingId },
                        wrapper,
                    });

                    expect(result.current.book.data?.id).to.equal(fellowshipOfTheRingId);
                    expect(result.current.author.data?.id).to.equal(tolkienId);
                    expect(result.current.favoriteAuthor.data?.id).to.equal('<fake-id-2>');

                    await bookWithAuthorsFavorite.prefetchQuery(client, {
                        bookId: prideAndPrejudiceId,
                    });

                    rerender({ bookId: prideAndPrejudiceId });

                    expect(result.current.book.data?.id).to.equal(prideAndPrejudiceId);
                    expect(result.current.author.data?.id).to.equal(austenId);
                    expect(result.current.favoriteAuthor.data).to.equal(undefined);
                }
            );

            contextWithWrapper.test(
                'Re-renders when cache changes',
                async ({ client, wrapper }) => {
                    await bookWithAuthorsFavorite.query(
                        client,
                        { bookId: fellowshipOfTheRingId },
                        { awaitLinks: true }
                    );

                    const { result } = renderHook(
                        () => useHook({ bookId: fellowshipOfTheRingId }),
                        {
                            wrapper,
                        }
                    );

                    expect(result.current.author.data?.name).to.equal('J.R.R. Tolkien');

                    authors.setQueryData(
                        client,
                        { authorId: tolkienId },
                        {
                            id: tolkienId,
                            name: '<new-name>',
                            favoriteAuthor: null,
                        }
                    );

                    await waitFor(() => {
                        expect(result.current.author.data?.name).to.equal('<new-name>');
                    });
                    expect(result.current.favoriteAuthor.data).to.equal(undefined);
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

            contextWithWrapper.test('useQueries', async ({ wrapper }) => {
                const { result } = renderHook(() => useHook(), {
                    wrapper,
                });

                expect(result.current).to.deep.equal({
                    fellowshipId: undefined,
                    austenId: undefined,
                    skipped: undefined,
                    tolkienId: undefined,
                });

                await waitFor(() => {
                    expect(result.current).to.deep.equal({
                        austenId,
                        tolkienId,
                        fellowshipId: fellowshipOfTheRingId,
                        skipped: undefined,
                    });
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

            contextWithWrapper.test('Renders data once loaded', async ({ client, wrapper }) => {
                const { result } = renderHook(() => useHook({ bookId: fellowshipOfTheRingId }), {
                    wrapper,
                });

                expect(result.current.book.data).to.equal(undefined);
                expect(result.current.author.data?.id).to.equal(undefined);
                expect(result.current.favoriteAuthor.data).to.equal(undefined);
                expect(
                    bookWithAuthorsFavorite.isFetching(client, { bookId: fellowshipOfTheRingId })
                ).to.equal(true);

                // Favorite author is already linked by the time it renders, so initial data is not used
                await waitFor(() => {
                    expect(result.current.favoriteAuthor.data?.id).to.equal(austenId);
                });
                expect(result.current.book.data?.id).to.equal(fellowshipOfTheRingId);
                expect(result.current.author.data?.id).to.equal(tolkienId);
            });

            context.test('Renders disabled without a provider', () => {
                const { result } = renderHook(() => useNormalizedPrefetchedQuery(skipToken));

                expect(result.current.data).to.equal(undefined);
            });

            context.test('Prefetches once in strict mode', async ({ client }) => {
                let calls = 0;
                const counted = resource<void, number>({
                    key: ['counted'],
                    queryFn: async () => {
                        calls++;
                        return calls;
                    },
                });

                const { result } = renderHook(
                    () =>
                        useNormalizedPrefetchedQuery(
                            useNormalizedPrefetchQuery(counted, undefined)
                        ),
                    { wrapper: createWrapper(client), reactStrictMode: true }
                );

                await waitFor(() => {
                    expect(result.current.data).to.equal(1);
                });
                expect(calls).to.equal(1);
            });
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
                    const { result } = renderHook(() => useHook(), { wrapper });

                    expect(result.current).to.equal(null);
                    expect(
                        books.getQueryState(client, { bookId: fellowshipOfTheRingId })?.fetchStatus
                    ).to.equal('fetching');
                    expect(authors.getQueryState(client, { authorId: tolkienId })).to.equal(
                        undefined
                    );
                    expect(authors.getQueryState(client, { authorId: austenId })).to.equal(
                        undefined
                    );

                    await waitFor(() => {
                        expect(result.current).to.not.equal(null);
                    });
                    expect(result.current.book.data.id).to.equal(fellowshipOfTheRingId);
                    expect(result.current.author.data.id).to.equal(tolkienId);
                    expect(result.current.favoriteAuthor.data.id).to.equal(austenId);
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
                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current).to.equal(null);

                await waitFor(() => {
                    expect(result.current).to.deep.equal({
                        austenId,
                        tolkienId,
                        fellowshipId: fellowshipOfTheRingId,
                    });
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
                const { result } = renderHook(() => useHook(), { wrapper });

                expect(result.current).to.equal(null);

                await waitFor(() => {
                    expect(result.current).to.not.equal(null);
                });
                expect(result.current.book).to.not.equal(null);
                expect(result.current.book!.data.id).to.equal(prideAndPrejudiceId);
                expect(result.current.author).to.not.equal(null);
                expect(result.current.author!.data.id).to.equal(austenId);
                expect(result.current.favoriteAuthor).to.equal(null);
            });

            contextWithWrapper.test(
                'Loads once params are provided',
                async ({ client, wrapper }) => {
                    const { result, rerender } = renderHook(
                        ({ params }: { params: SkipToken | { authorId: string } }) => ({
                            author: useNormalizedNullableSuspenseQuery(authors, params),
                        }),
                        { initialProps: { params: skipToken }, wrapper }
                    );

                    expect(result.current).to.deep.equal({ author: null });

                    // Placeholder for skipped query is safe to refetch
                    await client.refetchQueries();
                    expect(result.current).to.deep.equal({ author: null });

                    rerender({ params: { authorId: tolkienId } });

                    await waitFor(() => {
                        expect(result.current.author?.data.id).to.equal(tolkienId);
                    });
                }
            );
        });

        suite('useNormalizedPrefetchedSuspenseQuery', () => {
            const useHook = ({ bookId }: { bookId: string }) => {
                const prefetched = useNormalizedPrefetchQuery(bookWithAuthorsFavorite, { bookId });

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
                    const { result } = renderHook(
                        () => useHook({ bookId: fellowshipOfTheRingId }),
                        { wrapper }
                    );

                    expect(result.current).to.equal(null);
                    expect(
                        books.getQueryState(client, { bookId: fellowshipOfTheRingId })?.fetchStatus
                    ).to.equal('fetching');
                    expect(authors.getQueryState(client, { authorId: tolkienId })).to.equal(
                        undefined
                    );

                    await waitFor(() => {
                        expect(result.current.favoriteAuthor.data.id).to.equal(austenId);
                    });
                    expect(result.current.book.data.id).to.equal(fellowshipOfTheRingId);
                    expect(result.current.author.data.id).to.equal(tolkienId);
                }
            );

            contextWithWrapper.test(
                'Renders initial data until link is loaded',
                async ({ client, wrapper }) => {
                    await books.prefetchQuery(client, { bookId: fellowshipOfTheRingId });
                    await authors.prefetchQuery(client, { authorId: tolkienId });

                    const { result } = renderHook(
                        () => useHook({ bookId: fellowshipOfTheRingId }),
                        { wrapper }
                    );

                    expect(result.current.favoriteAuthor.data.id).to.equal('<fake-id>');
                }
            );
        });

        suite('useNormalizedNullablePrefetchedSuspenseQuery', () => {
            const useHook = ({ bookId }: { bookId: string }) => {
                const prefetched = useNormalizedPrefetchQuery(bookWithAuthorsFavorite, { bookId });

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

            contextWithWrapper.test('Suspends before data is loaded', async ({ wrapper }) => {
                const { result, rerender } = renderHook(useHook, {
                    initialProps: { bookId: fellowshipOfTheRingId },
                    wrapper,
                });

                expect(result.current).to.equal(null);

                await waitFor(() => {
                    expect(result.current.favoriteAuthor?.data.id).to.equal(austenId);
                });
                expect(result.current.book?.data.id).to.equal(fellowshipOfTheRingId);
                expect(result.current.author?.data.id).to.equal(tolkienId);

                rerender({ bookId: prideAndPrejudiceId });

                await waitFor(() => {
                    expect(result.current.book?.data.id).to.equal(prideAndPrejudiceId);
                });
                expect(result.current.author?.data.id).to.equal(austenId);
                expect(result.current.favoriteAuthor).to.equal(null);
            });
        });
    });
});
