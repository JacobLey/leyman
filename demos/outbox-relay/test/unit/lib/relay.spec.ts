import type { EventBridge } from '@aws-sdk/client-eventbridge';
import type { PutEventsClient } from '@leyman/demo-outbox-relay';
import { expectTypeOf } from 'expect-type';
import { retryDelayMs, toEntry } from '@leyman/demo-outbox-relay';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

suite('relay', () => {
    test("The SDK's client is a PutEventsClient", () => {
        expectTypeOf<EventBridge>().toExtend<PutEventsClient>();
    });

    suite('retryDelayMs', () => {
        test('Doubles from a second', () => {
            expect([1, 2, 3].map(attempts => retryDelayMs(attempts))).to.deep.equal([
                1000, 2000, 4000,
            ]);
        });

        test('Stops at 5 minutes', () => {
            expect(retryDelayMs(20)).to.equal(300_000);
        });
    });

    suite('toEntry', () => {
        const row = { id: '7', source: 'shop.orders', detailType: 'OrderPlaced', attempts: 1 };

        test('Adds the outbox id to the detail', () => {
            expect(toEntry({ ...row, detail: { orderId: '3' } }, 'bus')).to.deep.equal({
                EventBusName: 'bus',
                Source: 'shop.orders',
                DetailType: 'OrderPlaced',
                Detail: '{"orderId":"3","outboxId":"7"}',
            });
        });

        test('Sends a detail that is not an object as it is', () => {
            expect(toEntry({ ...row, detail: [1] }, 'bus').Detail).to.equal('[1]');
        });
    });
});
