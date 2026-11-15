import type { ClientBase, Pool } from 'pg';

/**
 * An event to send to EventBridge once the transaction that writes it commits.
 */
export interface OutboxEvent {
    /**
     * EventBridge's `Source`, e.g. `shop.orders`. One starting `aws.` is refused, and the row parked.
     */
    readonly source: string;
    /**
     * EventBridge's `DetailType`, e.g. `OrderPlaced`.
     */
    readonly detailType: string;
    /**
     * EventBridge's `Detail`. The relay adds `outboxId`, which consumers dedupe on.
     */
    readonly detail: Readonly<Record<string, unknown>>;
}

/**
 * Writes an event to the outbox. Call it inside the transaction that writes what the event announces: both commit,
 * or neither does. Inserting rings the doorbell, which Postgres delivers at commit.
 *
 * @param client - A client in the caller's open transaction
 * @param event - What to send
 * @returns The outbox row's id
 */
export const enqueue = async (client: ClientBase, event: OutboxEvent): Promise<string> => {
    const { rows } = await client.query<{ id: string }>(
        'INSERT INTO outbox (source, detail_type, detail) VALUES ($1, $2, $3) RETURNING id',
        [event.source, event.detailType, event.detail]
    );
    return rows[0]!.id;
};

/**
 * An order to place.
 */
export interface Order {
    readonly customer: string;
    readonly totalCents: number;
}

/**
 * Writes the order and its event in a transaction on `client`, rolling back if either fails.
 *
 * @param client - Client of its own
 * @param order - What was ordered
 * @returns The order's id
 * @rejects {Error} When either insert fails, after rolling back
 */
const writeOrder = async (client: ClientBase, order: Order): Promise<string> => {
    await client.query('BEGIN');
    try {
        const { rows } = await client.query<{ id: string }>(
            'INSERT INTO orders (customer, total_cents) VALUES ($1, $2) RETURNING id',
            [order.customer, order.totalCents]
        );
        const orderId = rows[0]!.id;
        await enqueue(client, {
            source: 'shop.orders',
            detailType: 'OrderPlaced',
            detail: { orderId, customer: order.customer, totalCents: order.totalCents },
        });
        await client.query('COMMIT');
        return orderId;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
};

/**
 * The example business write: an order, and the `OrderPlaced` event announcing it, in one transaction.
 *
 * @param pool - Pool to take a client from
 * @param order - What was ordered
 * @returns The order's id
 * @rejects {Error} When the order is refused (e.g. a negative total), with nothing written
 */
export const placeOrder = async (pool: Pool, order: Order): Promise<string> => {
    const client = await pool.connect();
    try {
        return await writeOrder(client, order);
    } finally {
        client.release();
    }
};
