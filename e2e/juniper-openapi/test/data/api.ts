// An example users and posts API, written the way an app would use juniper and openapi3-ts.
import type { oas31 } from 'openapi3-ts';
import type { ComponentsParams, Schema, SchemaType } from 'juniper';
import { OpenApiBuilder } from 'openapi3-ts/oas31';
import {
    arraySchema,
    components,
    defineRecursive,
    numberSchema,
    objectSchema,
    stringSchema,
} from 'juniper';

const idSchema = stringSchema({ format: 'uuid' });
const timestampSchema = stringSchema({ format: 'date-time' });

export const userSchema = objectSchema({
    properties: {
        id: idSchema,
        name: stringSchema({ minLength: 1, maxLength: 100 }),
        email: stringSchema({ format: 'email' }),
        createdAt: timestampSchema,
    },
    required: ['id', 'name', 'email', 'createdAt'],
    additionalProperties: false,
}).define('User');
export const newUserSchema = userSchema.omit(['id', 'createdAt']).define('NewUser');
export const userUpdateSchema = newUserSchema.partial().minProperties(1).define('UserUpdate');

export const postSchema = objectSchema({
    properties: {
        id: idSchema,
        authorId: idSchema,
        title: stringSchema({ minLength: 1, maxLength: 200 }),
        body: stringSchema(),
        tags: arraySchema(stringSchema()).maxItems(10),
        publishedAt: timestampSchema.nullable(),
    },
    required: ['id', 'authorId', 'title', 'body', 'tags', 'publishedAt'],
    additionalProperties: false,
}).define('Post');
export const newPostSchema = postSchema.pick(['title', 'body', 'tags']).define('NewPost');
export const postPageSchema = objectSchema({
    properties: {
        items: arraySchema(postSchema),
        nextCursor: stringSchema().nullable(),
    },
    required: ['items', 'nextCursor'],
    additionalProperties: false,
}).define('PostPage');

/**
 * A comment, with its replies threaded below it.
 */
export interface Comment {
    id: string;
    authorId: string;
    body: string;
    replies: Comment[];
}
export const commentSchema = defineRecursive<Comment>('Comment', self =>
    objectSchema({
        properties: {
            id: idSchema,
            authorId: idSchema,
            body: stringSchema({ minLength: 1 }),
            replies: arraySchema(self),
        },
        required: ['id', 'authorId', 'body', 'replies'],
        additionalProperties: false,
    })
);

export const errorSchema = objectSchema({
    properties: {
        code: stringSchema(),
        message: stringSchema(),
    },
    required: ['code', 'message'],
    additionalProperties: false,
}).define('Error');

export type User = SchemaType<typeof userSchema>;
export type NewUser = SchemaType<typeof newUserSchema>;
export type UserUpdate = SchemaType<typeof userUpdateSchema>;
export type Post = SchemaType<typeof postSchema>;
export type NewPost = SchemaType<typeof newPostSchema>;
export type PostPage = SchemaType<typeof postPageSchema>;

/**
 * Build the OpenAPI spec for the API.
 *
 * @param version - OpenAPI version
 * @returns OpenAPI document
 */
export const buildSpec = (version: '3.0.3' | '3.1.0'): oas31.OpenAPIObject => {
    // OpenAPI 3.0 has its own schema dialect. 3.1 uses JSON Schema 2020-12, with shared schemas in components.
    const options: ComponentsParams =
        version === '3.0.3' ? { openApi30: true } : { definitionsPath: '#/components/schemas/' };

    // Juniper's JSON output is loosely typed, so it is cast once to openapi3-ts's narrower schema type
    const schema = (s: Schema<unknown>): oas31.SchemaObject =>
        s.toJSON(options) as unknown as oas31.SchemaObject;
    const json = (s: Schema<unknown>): oas31.ContentObject => ({
        'application/json': { schema: schema(s) },
    });
    const errors = {
        400: { description: 'Invalid request', content: json(errorSchema) },
        404: { description: 'Not found', content: json(errorSchema) },
    };
    const pathId = (name: string): oas31.ParameterObject => ({
        name,
        in: 'path',
        required: true,
        schema: schema(idSchema),
    });

    return OpenApiBuilder.create({
        openapi: version,
        info: { title: 'Posts API', version: '1.0.0' },
        paths: {},
        security: [{ bearer: [] }],
        components: {
            // Every schema the paths reference, and the schemas they reference in turn
            schemas: components(
                [
                    userSchema,
                    newUserSchema,
                    userUpdateSchema,
                    postSchema,
                    newPostSchema,
                    postPageSchema,
                    commentSchema,
                    errorSchema,
                ],
                options
            ) as unknown as Record<string, oas31.SchemaObject>,
        },
    })
        .addSecurityScheme('bearer', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .addPath('/users', {
            post: {
                operationId: 'createUser',
                requestBody: { required: true, content: json(newUserSchema) },
                responses: {
                    201: { description: 'Created', content: json(userSchema) },
                    400: errors[400],
                },
            },
        })
        .addPath('/users/{userId}', {
            parameters: [pathId('userId')],
            get: {
                operationId: 'getUser',
                responses: {
                    200: { description: 'User', content: json(userSchema) },
                    404: errors[404],
                },
            },
            patch: {
                operationId: 'updateUser',
                requestBody: { required: true, content: json(userUpdateSchema) },
                responses: {
                    200: { description: 'Updated', content: json(userSchema) },
                    ...errors,
                },
            },
        })
        .addPath('/users/{userId}/posts', {
            parameters: [pathId('userId')],
            get: {
                operationId: 'listUserPosts',
                parameters: [
                    { name: 'cursor', in: 'query', schema: schema(stringSchema()) },
                    {
                        name: 'limit',
                        in: 'query',
                        schema: schema(
                            numberSchema({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
                        ),
                    },
                ],
                responses: {
                    200: { description: 'A page of posts', content: json(postPageSchema) },
                    404: errors[404],
                },
            },
        })
        .addPath('/posts', {
            post: {
                operationId: 'createPost',
                requestBody: { required: true, content: json(newPostSchema) },
                responses: {
                    201: { description: 'Created', content: json(postSchema) },
                    400: errors[400],
                },
            },
        })
        .addPath('/posts/{postId}/comments', {
            parameters: [pathId('postId')],
            get: {
                operationId: 'listPostComments',
                responses: {
                    200: {
                        description: 'Comment threads',
                        content: json(arraySchema(commentSchema)),
                    },
                    404: errors[404],
                },
            },
        })
        .addPath('/posts/{postId}', {
            parameters: [pathId('postId')],
            get: {
                operationId: 'getPost',
                responses: {
                    200: { description: 'Post', content: json(postSchema) },
                    404: errors[404],
                },
            },
        })
        .getSpec();
};
