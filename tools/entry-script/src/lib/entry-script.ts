import { defaultImport } from 'default-import';
import { MainNotImplementedError } from '#not-implemented-error';

/**
 * Base class for all entry script executable files.
 * Extend this class and export the result as "default"
 * to run automatically, when that file is NodeJS' entry point.
 */
export abstract class EntryScript {
    /**
     * Method called at the "start" of execution, if default export is an instance.
     *
     * Must be extended with any custom logic if exporting an instance.
     *
     * @param argv - parameters to script, _after_ the node executable and file name.
     * `node ./foo-bar.js --bing bong` -> `['--bing', 'bong']`
     * Based off process.argv
     * @throws {MainNotImplementedError} when not implemented
     */
    public async main(argv: string[]): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    public async main(): Promise<void> {
        throw new MainNotImplementedError(true);
    }

    /**
     * Method called at the "start" of execution, if default export is the class.
     *
     * Must be extended with any custom logic if exporting the class.
     * 
     * @param argv - parameters to script, _after_ the node executable and file name.
     * `node ./foo-bar.js --bing bong` -> `['--bing', 'bong']`
     * Based off process.argv
     * @throws {MainNotImplementedError} when not implemented
     */
    public static async main(argv: string[]): Promise<void>;
    public static async main(): Promise<void> {
        throw new MainNotImplementedError(false);
    }
}

const isEntryScript = (x: object): x is typeof EntryScript =>
    Object.prototype.isPrototypeOf.call(EntryScript, x);

/**
 * Method to load entry point module, and execute it if
 * it is a child class of EntryScript.
 *
 * The check happens locally (see call below) but is exported for testing purposes.
 * Should not be called elsewhere.
 *
 * @private
 * @param url - NodeJS process entry point.
 */
export const runAsMain = async (url?: string): Promise<void> => {
    if (url) {
        const rawEntryScript: unknown = await import(url).catch(() => null);
        const script = defaultImport(rawEntryScript);

        if (script && (script instanceof EntryScript || isEntryScript(script))) {
            await script.main(process.argv.slice(2));
        }
    }
};

void runAsMain(process.argv[1]);
