import { ResizableValkeyTopology, ShardedValkeyDriver } from '@leyman/demo-read-through-cache';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { uniquePrefix, valkeyNodes } from '../../helpers/valkey.js';

const keys = Array.from({ length: 20 }, (_, i) => `key-${i}`);

suite('ShardedValkeyDriver', () => {
    const withDriver = beforeEach(() => {
        const prefix = uniquePrefix();
        const topology = new ResizableValkeyTopology(valkeyNodes(3));
        return { prefix, topology, driver: new ShardedValkeyDriver(topology, prefix) };
    });

    withDriver.afterEach(async ({ topology }) => {
        await topology.close();
    });

    withDriver.test('Gets what was set', async ({ driver }) => {
        await driver.set('key', 'value');

        expect(await driver.get('key')).to.equal('value');
    });

    withDriver.test(
        'Stores a key on its node, under the prefix',
        async ({ driver, prefix, topology }) => {
            await driver.set('key', 'value');

            expect(await topology.connectionFor('key').get(`${prefix}:key`)).to.equal('value');
        }
    );

    withDriver.test('Expires a key after its TTL', async ({ driver, prefix, topology }) => {
        await driver.set('key', 'value', 60_000);

        expect(await topology.connectionFor('key').pttl(`${prefix}:key`)).to.be.within(1, 60_000);
    });

    withDriver.test('Returns undefined for a missing key', async ({ driver }) => {
        expect(await driver.get('key')).to.equal(undefined);
    });

    withDriver.test('Pulls a key, deleting it', async ({ driver }) => {
        await driver.set('key', 'value');

        expect(await driver.pull('key')).to.equal('value');
        expect(await driver.get('key')).to.equal(undefined);
    });

    withDriver.test('Deletes a key', async ({ driver }) => {
        await driver.set('key', 'value');

        expect(await driver.delete('key')).to.equal(true);
        expect(await driver.get('key')).to.equal(undefined);
    });

    withDriver.test('Deletes keys from every node', async ({ driver }) => {
        await Promise.all(keys.map(async key => driver.set(key, 'value')));

        await driver.deleteMany(keys);

        const values = await Promise.all(keys.map(async key => driver.get(key)));
        expect(values.filter(value => value !== undefined)).to.deep.equal([]);
    });

    withDriver.test('Clears its prefix from every node', async ({ driver }) => {
        await Promise.all(keys.map(async key => driver.set(key, 'value')));

        await driver.clear();

        const values = await Promise.all(keys.map(async key => driver.get(key)));
        expect(values.filter(value => value !== undefined)).to.deep.equal([]);
    });

    withDriver.test('Leaves other prefixes when clearing', async ({ driver, topology }) => {
        const other = new ShardedValkeyDriver(topology, uniquePrefix());
        await other.set('key', 'value');

        await driver.clear();

        expect(await other.get('key')).to.equal('value');
    });

    suite('namespace', () => {
        withDriver.test('Nests keys under the prefix', async ({ driver, prefix, topology }) => {
            await driver.namespace('users').set('key', 'value');

            expect(await topology.connectionFor('key').get(`${prefix}:users:key`)).to.equal(
                'value'
            );
        });

        withDriver.test('Keeps keys apart from the parent', async ({ driver }) => {
            await driver.namespace('users').set('key', 'value');

            expect(await driver.get('key')).to.equal(undefined);
        });
    });

    withDriver.test('Leaves the connections open on disconnect', async ({ driver, topology }) => {
        await driver.disconnect();

        const pongs = await Promise.all(
            topology.connections.map(async connection => connection.ping())
        );
        expect(pongs).to.deep.equal(['PONG', 'PONG', 'PONG']);
    });
});
