import type { NewPost, NewUser, Post, PostPage, User, UserUpdate } from '../data/api.js';
import SwaggerParser from '@apidevtools/swagger-parser';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { makeValidator } from 'juniper-validator';
import { suite, test } from 'mocha-chain';
import {
    buildSpec,
    newPostSchema,
    newUserSchema,
    postPageSchema,
    userUpdateSchema,
} from '../data/api.js';

suite('OpenAPI spec built with juniper', () => {
    for (const version of ['3.0.3', '3.1.0'] as const) {
        suite(`OpenAPI ${version}`, () => {
            test('Is a valid spec, with every $ref resolving', async () => {
                // `validate` resolves every reference, and fails on any that point nowhere
                await SwaggerParser.validate(
                    globalThis.structuredClone(buildSpec(version)) as never
                );
            });

            test('Shared schemas are emitted once, in components', () => {
                const spec = buildSpec(version);
                expect(
                    Object.keys(spec.components!.schemas!).toSorted((a, b) =>
                        a.localeCompare(b, 'en')
                    )
                ).to.deep.equal([
                    'Error',
                    'NewPost',
                    'NewUser',
                    'Post',
                    'PostPage',
                    'User',
                    'UserUpdate',
                ]);
                expect(spec).to.have.deep.nested.property(
                    'paths./users/{userId}.get.responses.200.content.application/json.schema',
                    { $ref: '#/components/schemas/User' }
                );
                // `PostPage` references `Post` rather than repeating it
                expect(spec.components!.schemas!.PostPage).to.have.nested.property(
                    'properties.items.items.$ref',
                    '#/components/schemas/Post'
                );
            });
        });
    }

    test('OpenAPI 3.0 and 3.1 differ only in their schema dialect', () => {
        const publishedAt = 'components.schemas.Post.properties.publishedAt';
        expect(buildSpec('3.0.3')).to.have.deep.nested.property(publishedAt, {
            type: 'string',
            format: 'date-time',
            nullable: true,
        });
        expect(buildSpec('3.1.0')).to.have.deep.nested.property(publishedAt, {
            type: ['string', 'null'],
            format: 'date-time',
        });
    });

    test('Types are inferred from the schemas', () => {
        expectTypeOf<User>().branded.toEqualTypeOf<{
            id: string;
            name: string;
            email: string;
            createdAt: string;
        }>();
        expectTypeOf<NewUser>().branded.toEqualTypeOf<{ name: string; email: string }>();
        expectTypeOf<UserUpdate>().branded.toEqualTypeOf<{ name?: string; email?: string }>();
        expectTypeOf<Post>().branded.toEqualTypeOf<{
            id: string;
            authorId: string;
            title: string;
            body: string;
            tags: string[];
            publishedAt: string | null;
        }>();
        expectTypeOf<NewPost>().branded.toEqualTypeOf<{
            title: string;
            body: string;
            tags: string[];
        }>();
        expectTypeOf<PostPage>().branded.toEqualTypeOf<{
            items: Post[];
            nextCursor: string | null;
        }>();
    });

    test('Request and response bodies validate', () => {
        expect(makeValidator(newUserSchema).is({ name: 'Ann', email: 'ann@example.com' })).to.equal(
            true
        );
        // `id` is set by the server
        expect(
            makeValidator(newUserSchema).is({ id: 'x', name: 'Ann', email: 'ann@example.com' })
        ).to.equal(false);

        const update = makeValidator(userUpdateSchema);
        expect(update.is({ name: 'Ann' })).to.equal(true);
        expect(update.is({})).to.equal(false);

        expect(
            makeValidator(newPostSchema).is({ title: 'Hello', body: '...', tags: ['intro'] })
        ).to.equal(true);
        expect(
            makeValidator(postPageSchema).is({
                items: [
                    {
                        id: '3f2c0a3e-6e8a-4a59-9c2b-1d2f3a4b5c6d',
                        authorId: '3f2c0a3e-6e8a-4a59-9c2b-1d2f3a4b5c6e',
                        title: 'Hello',
                        body: '...',
                        tags: [],
                        publishedAt: null,
                    },
                ],
                nextCursor: null,
            })
        ).to.equal(true);
    });
});
