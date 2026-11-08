/**
 * What a waiting request sleeps on between claims: a poll interval, cut short by a notification. A notification that
 * comes while the request is claiming, rather than sleeping, ends its next sleep at once, so none is missed.
 */
export class Wakeup {
    #isPending = false;
    #resolve: (() => void) | null = null;

    /**
     * Ends the current sleep, or the next one if none is under way.
     */
    public wake(): void {
        this.#isPending = true;
        this.#resolve?.();
    }

    /**
     * Forgets notifications so far, before claiming again.
     */
    public reset(): void {
        this.#isPending = false;
    }

    /**
     * Waits until woken, or `ms` pass, whichever is first.
     *
     * @param ms - Longest wait, in milliseconds
     */
    public async sleep(ms: number): Promise<void> {
        if (this.#isPending) {
            return;
        }
        await new Promise<void>(resolve => {
            const timer = setTimeout(() => {
                this.#resolve = null;
                resolve();
            }, ms);
            this.#resolve = () => {
                clearTimeout(timer);
                this.#resolve = null;
                resolve();
            };
        });
    }
}
