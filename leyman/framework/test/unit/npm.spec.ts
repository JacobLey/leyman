import { expect } from '@leyman/expect';
import { npmLatestVersion } from '@leyman/framework';
import { afterEach, suite, test } from 'mocha-chain';

suite('npmLatestVersion', () => {
    const realFetch = fetch;
    const respond = (status: number, body: unknown = {}): void => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment -- npmLatestVersion calls the global fetch
        globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
            expect(input).to.equal('https://registry.npmjs.org/@scope/pkg/latest');
            return Response.json(body, { status });
        };
    };

    afterEach(() => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment -- Restores the stub above
        globalThis.fetch = realFetch;
    });

    test("Reads the package's latest version", async () => {
        respond(200, { version: '1.2.3' });
        expect(await npmLatestVersion('@scope/pkg')).to.equal('1.2.3');
    });

    test('Is undefined for a package npm lacks', async () => {
        respond(404);
        expect(await npmLatestVersion('@scope/pkg')).to.equal(undefined);
    });

    test('Rejects when the registry fails', async () => {
        respond(503);
        await expect(npmLatestVersion('@scope/pkg')).to.eventually.be.rejectedWith(
            "npm's registry answered 503 for @scope/pkg"
        );
    });
});
