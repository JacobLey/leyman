---
description: Using pg-dolly with mocha-chain, Mocha and Vitest - connect once per run, clone per test, keep a failed test's database.
---

# Test runners

pg-dolly works with any test runner. The pattern is the same in each:

- **Once per run** (a root hook, or once per file): `connect()` and `template()`, and `close()` at the end. Calls in other processes or files reuse the template, so only the first builds it.
- **For each test that needs one:** `clone()` before it, and `keep()` after it if it failed.

## mocha-chain

With [mocha-chain](/packages/mocha-chain/), the clone is a typed fixture. A helper connects once, and gives each suite that asks a database per test:

```ts
// @filename: node.d.ts
declare module 'node:fs/promises' {
    export function readFile(path: URL, encoding: 'utf8'): Promise<string>;
}
// @filename: database.ts
// ---cut---
// test/helpers/database.ts
import { readFile } from 'node:fs/promises';
import { before } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

const schema = await readFile(new URL('../../schema.sql', import.meta.url), 'utf8');

// At the top level of a module, a hook applies to every test: a root hook, run once per process
const withDolly = before(async () => {
    const dolly = await PgDolly.connect();
    return { dolly, template: await dolly.template(schema) };
});
withDolly.after(async ({ dolly }) => {
    await dolly.close();
});

/**
 * Called inside a suite, so only its tests get a database each.
 */
export const withDatabase = () => {
    const withClone = withDolly.beforeEach(async ({ template }) => ({
        database: await template.clone(),
    }));
    withClone.afterEach(function ({ database }) {
        if (this.currentTest?.state === 'failed') {
            database.keep();
        }
    });
    return withClone;
};
```

Each suite then builds on the database. With a schema whose trigger announces every new item (`pg_notify('item_added', NEW.name)`):

```ts
// @filename: database.ts
import { before } from 'mocha-chain';
import { PgDolly } from 'pg-dolly';

const withDolly = before(async () => {
    const dolly = await PgDolly.connect();
    return { dolly, template: await dolly.template('') };
});
export const withDatabase = () =>
    withDolly.beforeEach(async ({ template }) => ({ database: await template.clone() }));
// @filename: node.d.ts
declare module 'node:events' {
    export function once(emitter: unknown, event: string): Promise<unknown[]>;
}
// @filename: items.spec.ts
// ---cut---
// test/integration/items.spec.ts
import { once } from 'node:events';
import { expect } from 'chai';
import { suite } from 'mocha-chain';
import pg from 'pg';
import { withDatabase } from './database.js';

suite('Items', () => {
    const withPool = withDatabase().beforeEach(({ database }) => ({
        // A small pool: every test shares the server's `max_connections`
        pool: new pg.Pool({ connectionString: database.url, max: 2 }),
    }));
    withPool.afterEach(async ({ pool }) => {
        await pool.end();
    });

    withPool.test('Adds an item', async ({ pool }) => {
        await pool.query("INSERT INTO item (id, name) VALUES (1, 'dolly')");

        const { rows } = await pool.query('SELECT name FROM item');
        expect(rows).to.deep.equal([{ name: 'dolly' }]);
    });

    withPool.test('Announces each item added', async ({ database, pool }) => {
        const listener = new pg.Client({ connectionString: database.url });
        await listener.connect();
        await listener.query('LISTEN item_added');
        const announced = once(listener, 'notification');

        await pool.query("INSERT INTO item (id, name) VALUES (1, 'dolly')");

        const [notification] = (await announced) as [pg.Notification];
        expect(notification.payload).to.equal('dolly');
        await listener.end();
    });
});
```

The second test only works because the insert commits: in a transaction rolled back after the test, the notification would never be sent.

::: warning
Only `before` and `after` belong at the top level of the helper. A `beforeEach` there would also be a root hook, cloning a database for every test, whether it needs one or not.
:::

## Mocha

The same with Mocha's own hooks, sharing variables:

```ts
// @filename: node.d.ts
declare module 'node:fs/promises' {
    export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
// @filename: index.ts
// ---cut---
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import { type DollyDatabase, type DollyTemplate, PgDolly } from 'pg-dolly';

let dolly: PgDolly;
let template: DollyTemplate;

// At the top level of a spec file (or in a root hook plugin), so it runs once for every file
before(async () => {
    dolly = await PgDolly.connect();
    template = await dolly.template(await readFile('schema.sql', 'utf8'));
});
after(async () => {
    await dolly.close();
});

describe('Items', () => {
    let database: DollyDatabase;
    beforeEach(async () => {
        database = await template.clone();
    });
    afterEach(function () {
        if (this.currentTest?.state === 'failed') {
            database.keep();
        }
    });

    it('Adds an item', async () => {
        // Connect to `database.url`
    });
});
```

## Vitest

Vitest runs each file in its own worker, so `beforeAll` at the top of a file (or in a `setupFiles` file) connects once per file. Every file after the first reuses the template. `onTestFailed` keeps the database of a test that fails:

```ts
// @filename: node.d.ts
declare module 'node:fs/promises' {
    export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
// @filename: index.ts
// ---cut---
import { readFile } from 'node:fs/promises';
import { type DollyDatabase, type DollyTemplate, PgDolly } from 'pg-dolly';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';

let dolly: PgDolly;
let template: DollyTemplate;

beforeAll(async () => {
    dolly = await PgDolly.connect();
    template = await dolly.template(await readFile('schema.sql', 'utf8'));
});
afterAll(async () => {
    await dolly.close();
});

describe('Items', () => {
    let database: DollyDatabase;
    beforeEach(async ({ onTestFailed }) => {
        database = await template.clone();
        onTestFailed(() => {
            database.keep();
        });
    });

    test('Adds an item', async () => {
        // Connect to `database.url`
    });
});
```

With [vitest-chain](/packages/vitest-chain/), the clone is a typed fixture as in mocha-chain above.
