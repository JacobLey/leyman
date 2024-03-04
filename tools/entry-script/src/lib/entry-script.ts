import { defaultImport } from 'default-import';
import { StaticEmitter } from 'static-emitter';

export const runtimeError = Symbol('runtimeError');

/**
 * Base class for all entry script executable files.
 * Extend this class and export the result as "default"
 * to run automatically, when that file is NodeJS' entry point.
 *
 * Extends StaticEmitter to emit error events.
 */
export class EntryScript extends StaticEmitter<{
    [runtimeError]: unknown;
}> {
    /**
     * Creates an instance of EntryScript's child class.
     *
     * Extendable to provide any "setup" (loading config, initializing connections).
     *
     * @param {EntryScript} this - child class of EntryScript
     * @returns {EntryScript} Instance of EntryScript.
     */
    public static async create<I extends typeof EntryScript>(
        this: I
    ): Promise<I['prototype']> {
        return new this();
    }

    /**
     * Method called at the "start" of execution (after setup).
     *
     * Extendable to provide any custom logic.
     */
    public async start(): Promise<void> {}

    /**
     * Method called at the "end" of execution (after start).
     *
     * Will be called even if `start` throws an error.
     *
     * Extendable to provide any custom logic.
     */
    public async finish(): Promise<void> {}

    /**
     * Create and execute script lifecycle.
     *
     * Called implicitly by default-exported classes, but can be called explicitly
     * as necessary.
     */
    public static async run(): Promise<void> {
        const script = await this.create();
        await script.run();
    }

    /**
     * Execute lifecycle of script.
     *
     * Called implicitly by static `run()` but can be called explicitly as necessary.
     */
    public async run(): Promise<void> {
        try {
            await this.start();
        } catch (err) {
            (this as EntryScript).emit(runtimeError, err);
            throw err;
        } finally {
            await this.finish();
        }
    }
}

/**
 * Method to load entry point module, and execute it if
 * it is a child class of EntryScript.
 *
 * The check happens locally (see call below) but is exported for testing purposes.
 * Should not be called elsewhere.
 *
 * @private
 * @param {string} url - NodeJS process entry point.
 */
export const runAsMain = async (url?: string): Promise<void> => {
    if (url) {
        const rawEntryScript = (await import(url).catch(
            () => {}
        )) as typeof EntryScript;
        const script = defaultImport(rawEntryScript);

        if (Object.prototype.isPrototypeOf.call(EntryScript, script)) {
            await script.run();
        }
    }
};

void runAsMain(process.argv[1]);
