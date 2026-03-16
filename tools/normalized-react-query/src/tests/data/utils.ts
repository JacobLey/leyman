import { randomUUID } from 'node:crypto';

export const getId = (): string => randomUUID();

export const delayImmediate = async (): Promise<void> => {
    await new Promise<void>(resolve => {
        setImmediate(() => {
            resolve();
        });
    });
};
