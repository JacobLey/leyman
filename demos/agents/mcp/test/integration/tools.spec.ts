import type { CallToolResult } from '@modelcontextprotocol/client';
import { sql } from 'drizzle-orm';
import { NotesMcpApiError } from '@leyman/demo-agents-mcp';
import { notes } from '@leyman/demo-openapi-server';
import document from '@leyman/demo-openapi-spec/openapi.json' with { type: 'json' };
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { connectAgent } from '../helpers/agent.js';
import { withStack } from '../helpers/stack.js';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/v;

/**
 * The text an agent reads from a result.
 *
 * @param result - A tool's
 * @returns Its one text block
 */
const textOf = (result: CallToolResult): string => {
    const [block] = result.content;
    return block?.type === 'text' ? block.text : '';
};

suite('Tools', () => {
    const withAgent = withStack().beforeEach(async ({ url }) => ({
        agent: await connectAgent(url),
    }));
    withAgent.afterEach(async ({ agent }) => {
        await agent.close();
    });

    suite('tools/list', () => {
        withAgent.test('Lists three tools, in a fixed order', async ({ agent }) => {
            const { tools } = await agent.client.listTools();

            expect(tools.map(({ name }) => name)).to.deep.equal([
                'find_notes',
                'read_note',
                'add_note',
            ]);
        });

        withAgent.test(
            'Fits a budget, as every agent pays for it in context',
            async ({ agent }) => {
                const { tools } = await agent.client.listTools();

                // About 550 tokens. Raise it on purpose, never by accident.
                expect(JSON.stringify(tools).length).to.be.at.most(2200);
            }
        );

        withAgent.test('Takes notes as the API does', async ({ agent }) => {
            const { tools } = await agent.client.listTools();
            const tool = tools.find(({ name }) => name === 'add_note');

            expect(tool?.inputSchema).to.deep.equal(document.components.schemas.NewNote);
        });

        withAgent.test('Says which tools only read', async ({ agent }) => {
            const { tools } = await agent.client.listTools();

            expect(
                Object.fromEntries(tools.map(({ name, annotations }) => [name, annotations]))
            ).to.deep.equal({
                find_notes: { readOnlyHint: true, openWorldHint: false },
                read_note: { readOnlyHint: true, openWorldHint: false },
                add_note: {
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: false,
                    openWorldHint: false,
                },
            });
        });
    });

    suite('find_notes', () => {
        /**
         * Notes a minute apart, so their order is known.
         */
        const withNotes = withAgent.beforeEach(async ({ db }) => {
            await db.insert(notes).values(
                Array.from({ length: 15 }, (_, index) => ({
                    title: index % 2 === 0 ? `Sheep ${index}` : `Goat ${index}`,
                    body: 'A long body the list leaves out',
                    createdAt: sql`timestamptz '2026-01-01T00:00:00Z' + ${index} * interval '1 minute'`,
                }))
            );
        });

        withNotes.test('Lists 10 summaries, newest first, without bodies', async ({ agent }) => {
            const result = await agent.client.callTool({ name: 'find_notes', arguments: {} });

            const { notes: found } = result.structuredContent as {
                readonly notes: readonly Readonly<Record<string, string>>[];
            };
            expect(found).to.have.length(10);
            expect(found[0]).to.have.keys(['id', 'title', 'createdAt']);
            expect(found[0]).to.include({
                title: 'Sheep 14',
                createdAt: '2026-01-01T00:14:00.000Z',
            });
        });

        withNotes.test(
            'Gives the same as text, for clients that only read text',
            async ({ agent }) => {
                const result = await agent.client.callTool({
                    name: 'find_notes',
                    arguments: { limit: 1 },
                });

                expect(JSON.parse(textOf(result))).to.deep.equal(result.structuredContent);
            }
        );

        withNotes.test('Filters by title, and takes a limit', async ({ agent }) => {
            const result = await agent.client.callTool({
                name: 'find_notes',
                arguments: { q: 'goat', limit: 2 },
            });

            expect(result.structuredContent).to.deep.equal({
                notes: [
                    {
                        id: (result.structuredContent as { notes: { id: string }[] }).notes[0]!.id,
                        title: 'Goat 13',
                        createdAt: '2026-01-01T00:13:00.000Z',
                    },
                    {
                        id: (result.structuredContent as { notes: { id: string }[] }).notes[1]!.id,
                        title: 'Goat 11',
                        createdAt: '2026-01-01T00:11:00.000Z',
                    },
                ],
            });
        });

        withAgent.test('Rejects a limit the API would', async ({ agent }) => {
            const result = await agent.client.callTool({
                name: 'find_notes',
                arguments: { limit: 101 },
            });

            expect(result.isError).to.equal(true);
        });
    });

    suite('read_note', () => {
        withAgent.test('Reads a note whole', async ({ agent, db }) => {
            const [row] = await db
                .insert(notes)
                .values({ title: 'Dolly', body: 'A sheep' })
                .returning();

            const result = await agent.client.callTool({
                name: 'read_note',
                arguments: { id: row!.id },
            });

            expect(result.structuredContent).to.deep.equal({
                id: row!.id,
                title: 'Dolly',
                body: 'A sheep',
                createdAt: row!.createdAt.toISOString(),
            });
        });

        withAgent.test('Says how to find an id that exists', async ({ agent }) => {
            const result = await agent.client.callTool({
                name: 'read_note',
                arguments: { id: '00000000-0000-4000-8000-000000000000' },
            });

            expect(result.isError).to.equal(true);
            expect(textOf(result)).to.equal(
                'No note has the id 00000000-0000-4000-8000-000000000000. find_notes lists the ids there are.'
            );
        });

        withAgent.test('Rejects an id that is not one', async ({ agent }) => {
            const result = await agent.client.callTool({
                name: 'read_note',
                arguments: { id: 'dolly' },
            });

            expect(result.isError).to.equal(true);
        });
    });

    suite('add_note', () => {
        withAgent.test(
            'Asks the user to approve writing, then adds the note',
            async ({ agent, db }) => {
                const result = await agent.authorized(async () =>
                    agent.client.callTool({
                        name: 'add_note',
                        arguments: { title: 'Dolly', body: 'A sheep' },
                    })
                );

                const [row] = await db.select().from(notes);
                expect(row).to.include({ title: 'Dolly', body: 'A sheep' });
                // Only what the agent doesn't know already
                expect(result.structuredContent).to.deep.equal({
                    id: row!.id,
                    createdAt: row!.createdAt.toISOString(),
                });
                expect(row!.id).to.match(uuid);
            }
        );

        withAgent.test('Asks for read and write together, keeping read', async ({ agent }) => {
            await agent.authorized(async () =>
                agent.client.callTool({ name: 'add_note', arguments: { title: 'Dolly', body: '' } })
            );

            const scopes = agent.provider.authorizations.map(url => url.searchParams.get('scope'));
            expect(scopes).to.deep.equal(['notes:read', 'notes:read notes:write']);
        });

        withAgent.test('Rejects a note the API would', async ({ agent, db }) => {
            const result = await agent.authorized(async () =>
                agent.client.callTool({ name: 'add_note', arguments: { title: '', body: '' } })
            );

            expect(result.isError).to.equal(true);
            expect(await db.select().from(notes)).to.deep.equal([]);
        });
    });

    suite('When the API fails', () => {
        const withStopped = withAgent.beforeEach(async ({ api }) => {
            await api.close();
        });

        withStopped.test(
            'Tells the agent only that the service failed',
            async ({ agent, errors }) => {
                const result = await agent.client.callTool({ name: 'find_notes', arguments: {} });

                expect(result.isError).to.equal(true);
                expect(textOf(result)).to.equal('The notes service failed. Try again later.');
                expect(errors).to.have.length(1);
            }
        );
    });
});

suite('Tools, when the API refuses the server', () => {
    // The API accepts tokens for another audience than the server's: it answers every call with a 401
    const withAgent = withStack({ apiAccepts: 'https://elsewhere.test' }).beforeEach(
        async ({ url }) => ({
            agent: await connectAgent(url),
        })
    );
    withAgent.afterEach(async ({ agent }) => {
        await agent.close();
    });

    for (const [name, args, operationId] of [
        ['find_notes', {}, 'listNotes'],
        ['read_note', { id: '00000000-0000-4000-8000-000000000000' }, 'getNote'],
        ['add_note', { title: 'Dolly', body: '' }, 'createNote'],
    ] as const) {
        withAgent.test(
            `Reports ${name}'s failure, without showing it`,
            async ({ agent, errors }) => {
                const result = await agent.authorized(async () =>
                    agent.client.callTool({ name, arguments: args })
                );

                expect(textOf(result)).to.equal('The notes service failed. Try again later.');
                expect(errors[0])
                    .to.be.instanceOf(NotesMcpApiError)
                    .and.include({ operationId, status: 401 });
            }
        );
    }
});

suite('Tools, for a 2025-era agent', () => {
    const withAgent = withStack().beforeEach(async ({ url }) => ({
        agent: await connectAgent(url, { legacy: true }),
    }));
    withAgent.afterEach(async ({ agent }) => {
        await agent.close();
    });

    withAgent.test('Lists the same tools', async ({ agent }) => {
        const { tools } = await agent.client.listTools();

        expect(tools.map(({ name }) => name)).to.deep.equal([
            'find_notes',
            'read_note',
            'add_note',
        ]);
    });

    withAgent.test('Asks the user to approve writing too', async ({ agent, db }) => {
        await agent.authorized(async () =>
            agent.client.callTool({ name: 'add_note', arguments: { title: 'Dolly', body: '' } })
        );

        expect(await db.select().from(notes)).to.have.length(1);
        expect(agent.provider.authorizations).to.have.length(2);
    });
});
