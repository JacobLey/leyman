---
description: Using pg-dolly with mocha-chain, Mocha and Vitest - connect once per run, clone per test, keep a failed test's database.
---

# Test runners

pg-dolly works with any test runner. The pattern is the same in each:

- **Once per run** (a root hook, or once per file): `connect()` and `template()`, and `close()` at the end. Calls in other processes or files reuse the template, so only the first builds it.
- **For each test that needs one:** `clone()` before it, and `keep()` after it if it failed.

## mocha-chain

With [mocha-chain](/mocha-chain/), the clone is a typed fixture. A helper connects once, and gives each suite that asks a database per test:

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

Each suite then builds on the database, here with a store under test:

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
// @filename: items.spec.ts
type Item = { readonly id: number; readonly name: string };
declare class ItemStore {
    constructor(options: { connectionString: string; max: number });
    add(item: Item): Promise<void>;
    get(id: number): Promise<Item | null>;
    close(): Promise<void>;
}
// ---cut---
// test/integration/items.spec.ts
import { expect } from 'chai';
import { suite } from 'mocha-chain';
import { withDatabase } from './database.js';

suite('Items', () => {
    const withStore = withDatabase().beforeEach(({ database }) => ({
        // A small pool: every test shares the server's `max_connections`
        store: new ItemStore({ connectionString: database.url, max: 2 }),
    }));
    withStore.afterEach(async ({ store }) => {
        await store.close();
    });

    withStore.test('Adds an item', async ({ store }) => {
        await store.add({ id: 1, name: 'dolly' });
        expect(await store.get(1)).to.include({ name: 'dolly' });
    });
});
```

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

With [vitest-chain](/vitest-chain/), the clone is a typed fixture as in mocha-chain above.
