---
description: Connect lease-cache to ioredis, iovalkey, node-redis or Valkey GLIDE.
---

# Clients

The cache only needs `eval`, so it works with any Valkey or Redis client. Each of these is tested against Valkey.

**ioredis** and **iovalkey** (the Valkey community's fork of ioredis) fit as they are, `Redis` and `Cluster` alike:

```ts
import { Redis } from 'iovalkey'; // or 'ioredis'
import { LeaseCache } from 'lease-cache';

const cache = new LeaseCache({
    connection: new Redis('redis://valkey:6379'),
    prefix: 'users',
    ttlMs: 60_000,
    leaseMs: 5000,
    pollMs: 50,
    waitMs: 2000,
});
```

**node-redis** (`redis`) takes keys and arguments in an options object:

```ts
import type { LeaseCacheConnection } from 'lease-cache';
import { createClient } from 'redis';

const client = await createClient({ url: 'redis://valkey:6379' }).connect();
const connection: LeaseCacheConnection = {
    eval: async (script, numKeys, ...args) => {
        const strings = args.map(String);
        return client.eval(script, {
            keys: strings.slice(0, numKeys),
            arguments: strings.slice(numKeys),
        });
    },
};
```

**Valkey GLIDE** (`@valkey/valkey-glide`) runs scripts through `Script` objects, which it loads once and then runs by hash (`EVALSHA`). Keep one per script, since each must be released:

```ts
import { GlideClient, Script } from '@valkey/valkey-glide';
import type { LeaseCacheConnection } from 'lease-cache';

const client = await GlideClient.createClient({ addresses: [{ host: 'valkey', port: 6379 }] });
// lease-cache uses a handful of fixed scripts, so these live as long as the client
const scripts = new Map<string, Script>();
const connection: LeaseCacheConnection = {
    eval: async (code, numKeys, ...args) => {
        let script = scripts.get(code);
        if (!script) {
            script = new Script(code);
            scripts.set(code, script);
        }
        const strings = args.map(String);
        return client.invokeScript(script, {
            keys: strings.slice(0, numKeys),
            args: strings.slice(numKeys),
        });
    },
};
```

On a cluster, use the client's cluster mode (ioredis's `Cluster`, node-redis's `createCluster`, `GlideClusterClient`): each key's value and lease share a hash tag, so they live on the same node. The tests only cover a single server.

