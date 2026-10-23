import { pathToFileURL } from 'node:url';
import { defaultImport } from 'default-import';
import { MainNotImplementedError } from '#not-implemented-error';
import { args, bin } from '#process-argv';

export interface Main {
    /**
     * Method called at the "start" of execution, if default export is an instance.
     *
     * Must be extended with any custom logic if exporting an instance.
     *
     * @param argv - parameters to script, _after_ the node executable and file name.
     * `node ./foo-bar.js --bing bong` -> `['--bing', 'bong']`
     */
    main: (argv: string[]) => Promise<void>;
}

/**
 * Base class for all entry script executable files.
 * Extend this class and export the result as "default"
 * to run automatically, when that file is Node.js' entry point.
 */
export abstract class EntryScript implements Main {
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
 * @param path - Node.js process entry point.
 */
export const runAsMain = async (path?: string): Promise<void> => {
    if (path === undefined) {
        return;
    }

    let rawEntryScript: unknown = null;
    try {
        // As a URL, since a path may contain characters that mean something else in one (e.g. `#`)
        rawEntryScript = await import(pathToFileURL(path).href);
    } catch {
        // Not importable, so not an entry script
    }
    const script = defaultImport(rawEntryScript);

    if (script instanceof EntryScript || (typeof script === 'function' && isEntryScript(script))) {
        await script.main(args);
    }
};

// Not awaited: the entry script imports this module, so awaiting its import here would deadlock
void runAsMain(bin);
