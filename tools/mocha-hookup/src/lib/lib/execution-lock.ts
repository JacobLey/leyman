import type { Runnable } from 'mocha';

let activeRunnable: Runnable | undefined;

export const checkLock = (): void => {
    if (
        activeRunnable
        // From what I can tell, this is the best way to determine if a hook/test is "complete"
        && typeof activeRunnable.duration !== 'number'
    ) {
        throw new Error('Cannot create new hook/suite/test while executing a hook/test');
    }
}

export const acquireLock = (runnable: Runnable): void => {
    checkLock();
    activeRunnable = runnable;
};