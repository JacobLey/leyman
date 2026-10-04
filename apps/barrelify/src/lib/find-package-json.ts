import type { FindPackageJSON, ReadFile } from './dependencies.js';
import { pathToFileURL } from 'node:url';
import { identifier } from 'haywire';
import { enumSchema, objectSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const modulePackageSchema = objectSchema({
    properties: {
        type: enumSchema().enum('module'),
        version: stringSchema(),
    },
    required: ['type'],
});

const isModulePackage = makeValidator(modulePackageSchema).is;
/**
 * Returns true if the given file has a package.json that _explicitly_ sets `"type": "module"`.
 *
 * @param file - filename
 * @returns true if module
 */
export type IsExplicitlyModuleDirectory = (file: string) => Promise<boolean>;
export const isExplicitlyModuleDirectoryId = identifier<IsExplicitlyModuleDirectory>();

/**
 * Package for loading the package.json of a given file.
 *
 * Can use this file to determine the "type" of packages by default (module vs commonjs).
 */
export class FindPackageJson {
    readonly #findPackageJSON: FindPackageJSON;
    readonly #readFile: ReadFile;

    public readonly isExplicitlyModuleDirectory: IsExplicitlyModuleDirectory;

    public constructor(findPackageJSON: FindPackageJSON, readFile: ReadFile) {
        this.#findPackageJSON = findPackageJSON;
        this.#readFile = readFile;

        this.isExplicitlyModuleDirectory = this.#isExplicitlyModuleDirectory.bind(this);
    }

    async #isExplicitlyModuleDirectory(file: string): Promise<boolean> {
        // Same lookup Node uses to determine a file's package scope
        const packageJsonPath = this.#findPackageJSON(pathToFileURL(file));

        if (packageJsonPath) {
            const content = await this.#readFile(packageJsonPath, 'utf8');
            return isModulePackage(JSON.parse(content));
        }

        return false;
    }
}
